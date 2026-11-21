<script>
  import {_} from 'svelte-i18n';
  import {Button} from '$lib/components/ui/button/index.js';
  import store, {consts, resetConfig} from '$lib/store.svelte.js';
  import {targetKind} from '$lib/target-config.js';

  let {selection} = $props();
  let disabled = $derived(store.busy || store.dialogBusy);
  let kind = $derived(targetKind(store.selectedFormat?.[0]));
  let format = $derived(store.selectedFormat?.[1]);
  let profile = $derived(consts.targetOptions?.[kind]?.[format]);
  let chooseOpusenc = $derived(kind === 'audio' && format === 'opus' && consts.targetEncoders.opus?.includes('opusenc'));
  let edited = $derived(Boolean(store.selectedEncoder) || Object.values(store.selectedOptions).some(value => value !== '' && value !== false));

  function update(key, value) {
    if (disabled || store.selectedOptions[key] === value) return;
    store.selectedOptions[key] = value;
    // Fields whose allowed values depend on the parent's choice don't carry
    // over when that choice changes.
    if (key === 'codec') for (const dependent of ['sampleRate', 'bitrateKbps', 'channels']) delete store.selectedOptions[dependent];
    if (key === 'videoCodec') {
      delete store.selectedOptions.crf;
      delete store.selectedOptions.pixelFormat;
    }
    if (key === 'dropSubtitles' && value) {
      delete store.selectedOptions.subtitleTrack;
      delete store.selectedOptions.defaultSubtitleTrack;
    }
  }

  function updateEncoder(value) {
    if (disabled || value === store.selectedEncoder) return;
    store.selectedEncoder = value;
    store.selectedOptions = {};
  }
</script>

<section data-testid="config-panel" aria-labelledby="conversion-config-title" class="border rounded-lg p-4 space-y-4">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 id="conversion-config-title" class="font-semibold">{$_('config.title')}</h2>
      <p class="text-sm text-muted-foreground">{$_('config.intro')}</p>
    </div>
    <Button data-testid="config-reset" variant="outline" size="sm" disabled={disabled || !edited} onclick={resetConfig}>{$_('config.reset')}</Button>
  </div>

  {#if chooseOpusenc}
    <div>
      <label class="flex flex-wrap items-center gap-2 text-sm">
        {$_('conversion.encoder')}
        <select data-testid="encoder-select" value={store.selectedEncoder} onchange={event => updateEncoder(event.currentTarget.value)} {disabled} class="border bg-background rounded p-2">
          <option value="">{$_('conversion.autoEncoder')}</option>
          <option value="opusenc">{$_('conversion.opusencEncoder')}</option>
        </select>
      </label>
      <p class="mt-1 text-xs text-muted-foreground">{$_('conversion.encoderHint')}</p>
    </div>
  {/if}

  {#if store.selectedEncoder === 'opusenc'}
    <p class="text-sm text-muted-foreground">{$_('config.opusencDefaults')}</p>
  {:else if selection.fields.length}
    <div class="grid gap-3 xl:grid-cols-2">
      {#each selection.fields as field (field.key)}
        {@const id = `config-${field.key}`}
        {@const invalid = selection.errors[field.key]}
        <div class="rounded-md bg-muted/70 p-3 space-y-1">
          {#if field.type === 'boolean'}
            <label class="flex gap-2 items-center text-sm font-medium" for={id}>
              <input id={id} data-testid={id} type="checkbox" {disabled} checked={store.selectedOptions[field.key] === true}
                aria-describedby={id + '-hint'} onchange={event => update(field.key, event.currentTarget.checked)}/>
              {$_(`config.field.${field.key}.label`)}
            </label>
          {:else}
            <label for={id} class="block text-sm font-medium">{$_(`config.field.${field.key}.label`)}</label>
            {#if field.type === 'select'}
              <select id={id} data-testid={id} {disabled} class="w-full border bg-background rounded p-2 text-sm"
                value={store.selectedOptions[field.key] ?? ''} aria-invalid={Boolean(invalid)}
                aria-describedby={id + '-hint' + (invalid ? ' ' + id + '-error' : '')} onchange={event => update(field.key, event.currentTarget.value)}>
                <option value="">{$_('config.automatic')}</option>
                {#each field.choices as choice}
                  <option value={String(choice)}>{field.key === 'pixelFormat' ? $_('config.hevc10Bit') : choice}</option>
                {/each}
              </select>
            {:else}
              <input id={id} data-testid={id} {disabled} class="w-full border bg-background rounded p-2 text-sm"
                type="text" inputmode="numeric" autocomplete="off" maxlength="8"
                placeholder={$_('config.automatic')} value={store.selectedOptions[field.key] ?? ''}
                aria-invalid={Boolean(invalid)} aria-describedby={id + '-hint' + (invalid ? ' ' + id + '-error' : '')}
                oninput={event => update(field.key, event.currentTarget.value)}/>
            {/if}
          {/if}
          <p id={id + '-hint'} class="text-xs text-muted-foreground">{$_(`config.field.${field.key}.hint`, {values: {min: field.min, max: field.max}})}</p>
          {#if invalid}<p id={id + '-error'} role="alert" class="text-xs text-destructive">{$_(`config.error.${invalid}`, {values: {min: field.min, max: field.max}})}</p>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">{$_('config.noOptions')}</p>
  {/if}

  {#if kind === 'video' && profile?.videoCodecs?.length === 0}
    <p data-testid="config-copy-only" class="text-xs text-muted-foreground">{$_('config.videoCopyOnly')}</p>
  {/if}
  {#if kind === 'video' && profile && !profile.preservesSubtitles}
    <p class="text-xs text-muted-foreground">{$_('config.videoSubtitleWarning')}</p>
  {/if}
  {#if kind === 'subtitle'}
    <p class="text-xs text-muted-foreground">{$_('config.subtitleHint')}</p>
  {/if}
</section>
