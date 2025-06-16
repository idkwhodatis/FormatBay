<script>
  import * as Menubar from "$lib/components/ui/menubar/index.js";
  import {Button,buttonVariants} from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {Minus,Square,X} from "@lucide/svelte";
</script>
 
<Menubar.Root class="rounded-none" style="margin-right:0;padding-right:0;-webkit-app-region:drag;">
  <div class="flex no-drag">
    <Menubar.Menu>
      <Menubar.Trigger>File</Menubar.Trigger>
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
      <Menubar.Trigger>Edit</Menubar.Trigger>
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
      <Menubar.Trigger>View</Menubar.Trigger>
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
      <Menubar.Trigger>Settings</Menubar.Trigger>
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
      <Menubar.Trigger>About</Menubar.Trigger>
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

  <div class="ml-auto flex no-drag">
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Button onclick={window.electronAPI.minimizeApp} size="icon" variant="ghost" class="rounded-none">
            <Minus/>
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>Minimize</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Button onclick={window.electronAPI.closeApp} size="icon" variant="ghost" class="rounded-none">
            <X/>
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>Close</p>
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