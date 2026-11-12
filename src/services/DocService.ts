import type { PolicyEngine } from '../policy/index.js';
import type { DocsPort } from '../ports/DocsPort.js';
import type { AuthManager } from '../auth/AuthManager.js';
import type { AuditLog } from '../state/AuditLog.js';
import { buildAppendPlan, type SeparatorType } from '../docs/appendPlan.js';
import { DomainError } from '../errors.js';
import { logger } from '../logger.js';

export interface AppendToDocServiceInput {
  document_id: string;
  content: string;
  format?: 'plain' | 'markdown_basic';
  separator?: SeparatorType;
  heading?: string;
  dry_run?: boolean;
}

export interface AppendToDocServiceOutput {
  status: 'appended' | 'validated_not_sent';
  document_id: string;
  document_url: string;
  document_title?: string;
  characters_appended: number;
  dry_run: boolean;
}

export class DocService {
  constructor(
    private readonly policyEngine: PolicyEngine,
    private readonly docsPort: DocsPort,
    private readonly authManager: AuthManager,
    private readonly auditLog: AuditLog
  ) {}

  async append(input: AppendToDocServiceInput): Promise<AppendToDocServiceOutput> {
    const startTime = Date.now();
    let cleanDocId = input.document_id;

    try {
      // Ensure caller is authenticated (throws AUTH_REQUIRED if tokens missing/invalid)
      await this.authManager.getAuthenticatedClient();

      // 1. Validation & safety policy
      const { docId, effectiveDryRun } = await this.policyEngine.validateAppendToDoc(input);
      cleanDocId = docId;

      // 2. Fetch doc end index and revision ID
      const endState = await this.docsPort.getEndState(cleanDocId);

      // 3. Compute atomic batchUpdate request plan
      const plan = buildAppendPlan(
        input.content,
        {
          separator: input.separator,
          heading: input.heading,
          format: input.format,
        },
        endState.endIndex
      );

      const docUrl = `https://docs.google.com/document/d/${cleanDocId}/edit`;

      // 4. Dry run
      if (effectiveDryRun) {
        await this.auditLog.record({
          tool: 'append_to_doc',
          status: 'validated_not_sent',
          outcome: 'validated_not_sent',
          duration_ms: Date.now() - startTime,
          doc_id: cleanDocId,
          chars: plan.charCount,
          dry_run: true,
        });

        logger.info({
          tool: 'append_to_doc',
          status: 'validated_not_sent',
          doc_id: cleanDocId,
          chars: plan.charCount,
          dry_run: true,
          duration_ms: Date.now() - startTime,
        });

        return {
          status: 'validated_not_sent',
          document_id: cleanDocId,
          document_url: docUrl,
          document_title: endState.title,
          characters_appended: plan.charCount,
          dry_run: true,
        };
      }

      // 5. Live update with revision conflict retry (max 1 retry)
      try {
        await this.docsPort.batchUpdate(cleanDocId, plan.requests, endState.revisionId);
      } catch (err: any) {
        if (err instanceof DomainError && err.code === 'DOC_CONFLICT') {
          logger.warn({
            tool: 'append_to_doc',
            status: 'conflict_retry',
            doc_id: cleanDocId,
          });

          // Fetch fresh revision and end state
          const freshState = await this.docsPort.getEndState(cleanDocId);
          const freshPlan = buildAppendPlan(
            input.content,
            {
              separator: input.separator,
              heading: input.heading,
              format: input.format,
            },
            freshState.endIndex
          );
          await this.docsPort.batchUpdate(cleanDocId, freshPlan.requests, freshState.revisionId);
        } else {
          throw err;
        }
      }

      // Record rate limit counter on success
      await this.policyEngine.getRateLimiter().recordAppend();

      await this.auditLog.record({
        tool: 'append_to_doc',
        status: 'appended',
        outcome: 'appended',
        duration_ms: Date.now() - startTime,
        doc_id: cleanDocId,
        chars: plan.charCount,
        dry_run: false,
      });

      logger.info({
        tool: 'append_to_doc',
        status: 'appended',
        doc_id: cleanDocId,
        chars: plan.charCount,
        dry_run: false,
        duration_ms: Date.now() - startTime,
      });

      return {
        status: 'appended',
        document_id: cleanDocId,
        document_url: docUrl,
        characters_appended: plan.charCount,
        dry_run: false,
      };
    } catch (err: any) {
      const errorCode = err instanceof DomainError ? err.code : 'INTERNAL_ERROR';

      await this.auditLog.record({
        tool: 'append_to_doc',
        status: 'rejected',
        outcome: 'rejected',
        duration_ms: Date.now() - startTime,
        doc_id: cleanDocId,
        error_code: errorCode,
      });

      logger.warn({
        tool: 'append_to_doc',
        status: 'rejected',
        doc_id: cleanDocId,
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
      });

      throw err;
    }
  }
}
