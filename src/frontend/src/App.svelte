<script>
  import './app.css';
  import Counter from './lib/Counter.svelte';
  import Topbar from '$lib/components/Topbar.svelte';
</script>

<main>
  <Topbar/>
  <div class="card">
    <Counter/>
  </div>
</main>
