export function buildRepairPrompt(issues: string): string {
  return [
    'Your previous response failed validation. Fix it.',
    `Validation errors: ${issues}`,
    'Return ONLY the corrected JSON object. Keep all data that was valid, change only what is necessary.',
    'Remember: use null instead of inventing values, and never add fields outside the schema.',
  ].join('\n');
}

export function buildBatchPrompt(count: number): string {
  return [
    `You will receive ${count} separate documents delimited with <<<DOC n>>>.`,
    'Extract one object from each document and return them in the SAME ORDER inside the `results` array.',
    'Do not merge documents. Do not skip any document. Return exactly the requested JSON object.',
  ].join('\n');
}

export function wrapDocuments(documents: string[]): string {
  return documents
    .map((doc, index) => `<<<DOC ${index + 1}>>>\n${doc}\n<<<END DOC ${index + 1}>>>`)
    .join('\n\n');
}
