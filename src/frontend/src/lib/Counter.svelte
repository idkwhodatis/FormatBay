<script>
  import { Button } from "$lib/components/ui/button/index.js";
  let count = $state(0)
  const increment = () => {
    count += 1
  }
</script>

<button onclick={increment}>
  count is {count}
</button>
<br/>
<Button onclick={increment}>count is {count}</Button>