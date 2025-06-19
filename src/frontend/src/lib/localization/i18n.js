import {register,init,getLocaleFromNavigator} from 'svelte-i18n';

register('en-us',()=>import('./en-us.json'));
register('zh-cn',()=>import('./zh-cn.json'));

init({
  fallbackLocale:'en-us',
  // fallbackLocale:'zh-cn',
  initialLocale:getLocaleFromNavigator(),
});

