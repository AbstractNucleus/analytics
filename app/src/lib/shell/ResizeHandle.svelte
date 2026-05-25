<!-- Drag-to-resize handle. Sits between two flex children; on pointer-drag,
     calls the provided onResize with the new pixel width. Width is bounded
     and clamped upstream by the shell store. -->
<script lang="ts">
  type Props = {
    /** Current value (px). Used to seed the drag math. */
    value: number;
    /** Called with the proposed new value during drag. Free to clamp. */
    onResize: (next: number) => void;
    /** Accessible label for the splitter. */
    ariaLabel?: string;
    /** Min/max for aria-valuenow/valuemin/valuemax. */
    min?: number;
    max?: number;
    /** Keyboard step in px. Defaults to 16. */
    step?: number;
  };

  const {
    value,
    onResize,
    ariaLabel = 'Resize sidebar',
    min = 200,
    max = 480,
    step = 16,
  }: Props = $props();

  let dragging = $state(false);
  let startX = 0;
  let startValue = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startValue = value;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    onResize(startValue + dx);
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onResize(value - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onResize(value + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onResize(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onResize(max);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="handle"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label={ariaLabel}
  aria-valuenow={value}
  aria-valuemin={min}
  aria-valuemax={max}
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onkeydown={onKey}
>
  <span class="grip" aria-hidden="true"></span>
</div>

<style>
  .handle {
    position: relative;
    width: 5px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    transition: background var(--motion-fast) var(--ease);
    user-select: none;
    touch-action: none;
    z-index: 5;
  }
  .handle::before {
    content: '';
    position: absolute;
    inset: 0 -3px;
    /* Wider hit target than the visible line. */
  }
  .handle:hover,
  .handle:focus-visible,
  .handle.dragging {
    background: color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .handle:focus-visible {
    outline: none;
  }
  .grip {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 1px;
    height: 24px;
    background: var(--border-strong);
    transform: translate(-50%, -50%);
    border-radius: 1px;
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease);
  }
  .handle:hover .grip,
  .handle:focus-visible .grip,
  .handle.dragging .grip {
    opacity: 1;
    background: var(--accent);
  }
</style>
