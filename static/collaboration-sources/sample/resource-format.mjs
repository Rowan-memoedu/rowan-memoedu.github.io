// Shared display metadata only; validation and independent audit live in scripts/.
export const resourceMimeTypes=Object.freeze({
  pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',
  txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json',yaml:'application/yaml',yml:'application/yaml',
  zip:'application/zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  wav:'audio/wav',mp3:'audio/mpeg',mp4:'video/mp4',webm:'video/webm',
});
export const resourceFormat=item=>item.format??'pdf';
export const resourceMimeType=item=>resourceMimeTypes[resourceFormat(item)];
export const resourceHref=item=>'/resources/files/'+item.sha256+'.'+resourceFormat(item);
export function formatResourceSize(bytes){
  if(bytes<1000)return bytes+' B';
  if(bytes<1_000_000)return (bytes/1000).toFixed(1)+' KB';
  if(bytes<1_000_000_000)return (bytes/1_000_000).toFixed(1)+' MB';
  return (bytes/1_000_000_000).toFixed(1)+' GB';
}
