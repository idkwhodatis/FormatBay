<script>
  import * as Menubar from "$lib/components/ui/menubar/index.js";
  import {Button,buttonVariants} from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {Label} from "$lib/components/ui/label/index.js";
  import {Switch} from "$lib/components/ui/switch/index.js";
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import {Minus,Square,X,FolderCode} from "@lucide/svelte";
  import {_} from 'svelte-i18n'
  import HoverCardContent from "./ui/hover-card/hover-card-content.svelte";

  import store from "$lib/store.svelte.js";

  let offlineModeText=$derived(store.offlineMode ? "topbar.offline.pure":"topbar.offline.download")
</script>
 
<Menubar.Root class="rounded-none" style="margin-right:0;padding-right:0;-webkit-app-region:drag;">
  <div class="flex no-drag">
    <Menubar.Menu>
      <Menubar.Trigger>{$_("topbar.file.title")}</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          New Tab
          <Menubar.Shortcut>⌘T</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>New Window</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Share</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Print</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>{$_("topbar.edit.title")}</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          Edit
          <Menubar.Shortcut>⌘T</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>New Window</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Share</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Print</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>{$_("topbar.view.title")}</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          Edit
          <Menubar.Shortcut>⌘T</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>New Window</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Share</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Print</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>{$_("topbar.settings.title")}</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          Edit
          <Menubar.Shortcut>⌘T</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>New Window</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Share</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Print</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
    <Menubar.Menu>
      <Menubar.Trigger>{$_("topbar.about.title")}</Menubar.Trigger>
      <Menubar.Content>
        <Menubar.Item>
          Edit
          <Menubar.Shortcut>⌘T</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Item>New Window</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Share</Menubar.Item>
        <Menubar.Separator/>
        <Menubar.Item>Print</Menubar.Item>
      </Menubar.Content>
    </Menubar.Menu>
  </div>

  <div class="flex no-drag space-x-2">
    <Button variant="ghost" class="rounded-none active:bg-gray-200">
      <FolderCode/>{$_("topbar.outputfolder.tooltip")}
    </Button>

    <HoverCard.Root>
      <HoverCard.Trigger>
        <div class="flex flex-row h-full items-center space-x-2">
          <Switch bind:checked={store.offlineMode} onCheckedChange={async ()=>{await window.store.set("offlineMode",store.offlineMode)}} id="offline"/>
          <Label for="offline">{$_(offlineModeText+".title")}</Label>
        </div>
      </HoverCard.Trigger>
      <HoverCard.Content class="w-82">
        <div class="flex flex-col justify-between space-x-4 space-y-1">
            <h3 class="font-bold">{$_(offlineModeText+".titlefull")}</h3>
            <p>{$_(offlineModeText+".description")}</p>
        </div>
      </HoverCard.Content>
    </HoverCard.Root>
  </div>

  <div class="ml-auto flex no-drag">
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Button onclick={window.electronAPI.minimizeApp} size="icon" variant="ghost" class="rounded-none active:bg-gray-200">
            <Minus/>
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$_("topbar.minimize.tooltip")}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Button onclick={window.electronAPI.closeApp} size="icon" variant="ghost" class="rounded-none active:bg-gray-200">
            <X/>
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$_("topbar.close.tooltip")}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </div>
</Menubar.Root>

<style>
  .no-drag{
    -webkit-app-region:no-drag
  }
</style>