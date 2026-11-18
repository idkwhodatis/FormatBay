/**
 * A media artifact is a probed state, not an extension.
 * @typedef {{kind:string,format:string,audioCodec?:string,hasAudio?:boolean,hasVideo?:boolean}} Artifact
 * @typedef {{id:string,toolId:string,label:string,available?:boolean,network?:boolean,
 * accepts:(state:Artifact)=>boolean,output:(state:Artifact)=>Artifact,
 * loss:number,warnings?:(state:Artifact)=>string[]}} Capability
 */
export function stateKey(state) {
  return JSON.stringify(Object.keys(state).sort().map(key => [key, state[key]]));
}
export function matchesTarget(state, target) {
  return state.kind === target.kind && state.format === target.format;
}

/** Find a bounded, cycle-free route; minimize quality loss before step count. */
export function planConversion(input, target, capabilities, {offline = true, maxSteps = 4, maxStates = 2000} = {}) {
  if (!input || !target || !Array.isArray(capabilities)) throw new Error('Invalid conversion request');
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 16) throw new Error('Invalid route limit');
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 10000) throw new Error('Invalid search limit');
  const ids = new Set();
  for (const edge of capabilities) {
    if (ids.has(edge.id) || !edge.id || !Number.isFinite(edge.loss) || edge.loss < 0) throw new Error('Invalid capability registry');
    ids.add(edge.id);
  }
  if (target.kind === 'audio' && !input.hasAudio) {
    return {ok:false, reason:'no-audio', message:'The input has no audio stream.'};
  }
  const queue = [{state:input,steps:[],warnings:[],loss:0,visited:new Set([stateKey(input)])}];
  const best = new Map();
  let explored = 0;
  while (queue.length && explored++ < maxStates) {
    queue.sort((a,b) => a.loss-b.loss || a.steps.length-b.steps.length);
    const current = queue.shift();
    // A conversion request always produces a new artifact, even for the same format.
    if (current.steps.length && matchesTarget(current.state,target)) {
      return {ok:true,input,target,steps:current.steps,warnings:[...new Set(current.warnings)],loss:current.loss};
    }
    if (current.steps.length >= maxSteps) continue;
    for (const edge of capabilities) {
      if (edge.available === false || (offline && edge.network) || !edge.accepts(current.state)) continue;
      const output = edge.output(current.state);
      const key = stateKey(output);
      const isGoal = matchesTarget(output,target);
      if (current.visited.has(key) && !isGoal) continue;
      const loss = current.loss + edge.loss;
      const depth = current.steps.length+1;
      // Keep depth in the key: a lower-loss long route can run out of the step budget.
      const searchKey = `${key}:${depth}`;
      if ((best.get(searchKey) ?? Infinity) <= loss) continue;
      best.set(searchKey,loss);
      const warnings = edge.warnings?.(current.state) ?? [];
      queue.push({state:output,loss,
        steps:[...current.steps,{capabilityId:edge.id,toolId:edge.toolId,toolVersion:edge.toolVersion??null,label:edge.label,input:current.state,output}],
        warnings:[...current.warnings,...warnings],visited:new Set([...current.visited,key])});
    }
  }
  return {ok:false,reason:explored > maxStates ? 'search-limit' : 'unreachable',
    message:'No compatible local conversion route is available. Check the installed tools and input codecs.'};
}
