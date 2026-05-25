export { default as Sidebar } from './Sidebar.svelte';
export { default as SidebarHostItem } from './SidebarHostItem.svelte';
export { default as ResizeHandle } from './ResizeHandle.svelte';
export {
  shellState,
  setSidebarWidth,
  setSidebarCollapsed,
  toggleSidebar,
  restoreShellState,
  readShellState,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  type ShellState,
} from './shellStore';
