/**
 * A media artifact is a probed state, not an extension.
 * @typedef {{kind:string,format:string,audioCodec?:string,hasAudio?:boolean,hasVideo?:boolean,audioChannels?:number,audioLayout?:string}} Artifact
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
export function planConversion(input, target, capabilities, {offline = true, maxSteps = 4, maxStates = 2000, requiredFinalTool = null, requiredAudioLayout = null} = {}) {
  if (requiredAudioLayout!==null && typeof requiredAudioLayout!=='string') throw new Error('Invalid speaker-layout constraint');
  const reachesTarget=state=>matchesTarget(state,target) && (requiredAudioLayout===null || state.audioLayout===requiredAudioLayout);
  if (!input || !target || !Array.isArray(capabilities)) throw new Error('Invalid conversion request');
  if (requiredFinalTool!==null && (typeof requiredFinalTool!=='string'||!requiredFinalTool)) throw new Error('Invalid encoder selection');
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
  // Editing an artifact in its own format must not round-trip via another format.
  const directOnly = matchesTarget(input,target);
  const queue = [{state:input,steps:[],warnings:[],loss:0,visited:new Set([stateKey(input)])}];
  const best = new Map();
  let explored = 0;
  while (queue.length && explored++ < maxStates) {
    queue.sort((a,b) => a.loss-b.loss || a.steps.length-b.steps.length);
    const current = queue.shift();
    // A conversion request always produces a new artifact, even for the same format.
    if (current.steps.length && reachesTarget(current.state) && (!requiredFinalTool || current.steps.at(-1).toolId===requiredFinalTool)) {
      return {ok:true,input,target,steps:current.steps,warnings:[...new Set(current.warnings)],loss:current.loss};
    }
    if (current.steps.length >= (directOnly ? 1 : maxSteps)) continue;
    for (const edge of capabilities) {
      if (edge.available === false || (offline && edge.network) || !edge.accepts(current.state)) continue;
      const output = edge.output(current.state);
      const key = stateKey(output);
      const isGoal = reachesTarget(output);
      if (directOnly && (!isGoal || (requiredFinalTool && edge.toolId!==requiredFinalTool))) continue;
      if (current.visited.has(key) && !isGoal) continue;
      const loss = current.loss + edge.loss;
      const depth = current.steps.length+1;
      // Keep depth in the key: a lower-loss long route can run out of the step budget.
      const searchKey = `${key}:${depth}:${requiredFinalTool?edge.toolId:''}`;
      if ((best.get(searchKey) ?? Infinity) <= loss) continue;
      best.set(searchKey,loss);
      const warnings = edge.warnings?.(current.state) ?? [];
      queue.push({state:output,loss,
        steps:[...current.steps,{capabilityId:edge.id,toolId:edge.toolId,toolVersion:edge.toolVersion??null,verifyInput:edge.verifyInput===true,label:edge.label,input:current.state,output}],
        warnings:[...current.warnings,...warnings],visited:new Set([...current.visited,key])});
    }
  }
  if (directOnly && !queue.length) {
    return {ok:false,reason:'same-format-direct-only',message:'This format can only be edited with one compatible tool in one step. No such route is available for this input and tool selection.'};
  }
  return {ok:false,reason:explored > maxStates ? 'search-limit' : 'unreachable',
    message:requiredAudioLayout===null?'No compatible local conversion route is available. Check the installed tools and input codecs.':`No compatible local conversion route preserves the input speaker layout (${requiredAudioLayout || 'unknown'}). Check the installed tools and input codecs/layout.`};
}
