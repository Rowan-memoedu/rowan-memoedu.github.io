// Pure document primitives: the reader must not import build-time file access.
export const isDocumentRem=node=>node?.remType==='document'||node?.remType==='dailyDocument';
// Conversion requires one contiguous ordinary prefix followed only by documents.
// An all-document list needs no annotation but retains its document container.
export function hasDocumentSuffix(children){
  const first=children.findIndex(isDocumentRem);
  return first>=0&&children.slice(first).every(isDocumentRem);
}
export const escapeSiteText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
