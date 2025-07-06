import config from "../config";

export interface KbDocument {
  id: string;
  name: string;
  status: 'Processing' | 'Indexed' | 'Error';
  addedAt: string;
}

/**
 * Upload a document to the knowledge base
 */
export async function uploadKnowledgeDocument(file: File): Promise<KbDocument> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${config.apiUrl}/kb/documents`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch all documents from the knowledge base
 */
export async function getKnowledgeDocuments(): Promise<KbDocument[]> {
  const response = await fetch(`${config.apiUrl}/kb/documents`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to fetch documents: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete a document from the knowledge base
 */
export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/kb/documents/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to delete document: ${response.status}`);
  }
} 