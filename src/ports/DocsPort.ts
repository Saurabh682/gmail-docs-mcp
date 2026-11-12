export interface DocEndState {
  endIndex: number;
  revisionId: string;
  title: string;
}

export interface DocsPort {
  getEndState(docId: string): Promise<DocEndState>;
  batchUpdate(
    docId: string,
    requests: any[],
    requiredRevisionId?: string
  ): Promise<{ documentId: string }>;
}
