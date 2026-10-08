// Pure document primitives: the reader must not import build-time file access.
export const isDocumentRem=node=>node?.remType==='document'||node?.remType==='dailyDocument';
export const escapeSiteText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
