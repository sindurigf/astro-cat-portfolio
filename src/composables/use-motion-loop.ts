import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import {
  createMotionLoop,
  type MotionLoop,
  type MotionLoopOptions,
} from '../scripts/motion-loop';

export { IDLE, NEXT_FRAME } from '../scripts/motion-loop';

export interface VueMotionLoop extends Omit<
  MotionLoop,
  'reducedMotion' | 'connect' | 'disconnect'
> {
  /** Read from the media query before any other `onMounted` hook runs. */
  reducedMotion: Ref<boolean>;
}

/** The motion loop for a Vue island: it connects on mount and disconnects on unmount. */
export const useMotionLoop = (options: MotionLoopOptions): VueMotionLoop => {
  const reducedMotion = ref(false);
  const { connect, disconnect, ...loop } = createMotionLoop({
    ...options,
    onReducedMotion: (reduced) => {
      reducedMotion.value = reduced;
      options.onReducedMotion?.(reduced);
    },
  });

  onMounted(() => {
    connect();
    reducedMotion.value = loop.reducedMotion();
  });
  onBeforeUnmount(disconnect);

  return { ...loop, reducedMotion };
};
