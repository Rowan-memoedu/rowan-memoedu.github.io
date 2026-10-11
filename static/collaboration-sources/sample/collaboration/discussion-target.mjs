// Original nodes keep their native discussion identity while being edited.
export function discussionTarget(proposal,nodeId,anchorId){
  if(proposal.kind==='edit'&&nodeId===(proposal.editRootId??proposal.nodes[0]?.id))return {anchorId};
  const source=proposal.outline?.sources?.[nodeId];
  if(source&&!source.publicationPending)return {anchorId:source.nodeId??nodeId};
  if(proposal.outline?.originalIds?.includes(nodeId)&&/^r-(?:[a-f0-9]{2})+$/u.test(nodeId))return {anchorId:nodeId};
  return {anchorId,proposalId:proposal.id,proposalNodeId:nodeId};
}
