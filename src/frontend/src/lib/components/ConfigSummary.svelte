<script>
  import {_} from 'svelte-i18n';
  import {reviewOrder} from '$lib/target-config.js';
  let {target, plan} = $props();
  let entries = $derived(reviewOrder.filter(key => Object.hasOwn(target.options ?? {}, key)));
  let tracks = $derived((plan?.input?.streams ?? []).filter(track => ['audio', 'subtitle'].includes(track.type)));
</script>

<section data-testid="task-config" aria-label={$_('config.review')} class="rounded-md bg-muted/70 p-3 space-y-2">
  <h4 class="text-sm font-medium">{$_('config.review')}</h4>
  {#if target.encoder || entries.length}
    <dl class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {#if target.encoder}
        <dt class="text-muted-foreground">{$_('conversion.encoder')}</dt><dd>{target.encoder}</dd>
      {/if}
      {#each entries as key (key)}
        <dt class="text-muted-foreground">{$_(`config.field.${key}.label`)}</dt>
        <dd data-testid={`task-config-${key}`}>{key === 'pixelFormat' && target.options[key] === 'yuv420p10le' ? $_('config.hevc10Bit') : typeof target.options[key] === 'boolean' ? $_(`config.${target.options[key] ? 'yes' : 'no'}`) : target.options[key]}</dd>
      {/each}
    </dl>
  {:else}
    <p class="text-sm text-muted-foreground">{$_('config.automaticReview')}</p>
  {/if}
  {#if tracks.length}
    <details class="text-sm">
      <summary class="cursor-pointer font-medium">{$_('config.inputTracks')}</summary>
      <p class="mt-1 text-xs text-muted-foreground">{$_('config.inputTracksHint')}</p>
      <ul class="mt-2 space-y-1">
        {#each tracks as track (track.index)}
          <li data-testid="input-track" class="break-all">
            <strong>{$_(`left.formats.${track.type}.title`)} {track.ordinal}</strong>:
            {track.codec}{track.tags?.language ? ' · ' + track.tags.language : ''}{track.tags?.title ? ' · ' + track.tags.title : ''}
            {#if track.default}<span class="text-muted-foreground"> · {$_('config.defaultTrack')}</span>{/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>
