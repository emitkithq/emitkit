import { animate, type AnimationOptions, type DOMKeyframesDefinition } from 'motion';
import type { Action } from 'svelte/action';

/**
 * Parameters for the motion action
 */
export type MotionParams = {
	keyframes: DOMKeyframesDefinition;
	options?: AnimationOptions;
};

/**
 * Svelte action for animating elements using Motion.dev
 *
 * @example
 * ```svelte
 * <div use:motion={{ keyframes: { opacity: [0, 1] }, options: { duration: 0.3 } }}>
 *   Animated content
 * </div>
 * ```
 */
export const motion: Action<HTMLElement, MotionParams | undefined> = (
	node: HTMLElement,
	data: MotionParams | undefined = { keyframes: { opacity: [0, 1] } }
) => {
	if (!data) {
		return;
	}

	// Start animation immediately
	const animation = animate(node, data.keyframes, data.options);
	animation.play();

	// Return cleanup function that will be called when element is destroyed
	return {
		destroy() {
			animation.cancel();
		}
	};
};

/**
 * Common animation presets for consistent animations across the app
 */
export const animations = {
	/**
	 * Subtle fade in from bottom - good for lists and grids
	 */
	fadeInUp: (delay = 0): MotionParams => ({
		keyframes: {
			opacity: [0, 1],
			y: [8, 0]
		},
		options: {
			duration: 0.4,
			delay,
			ease: [0.22, 0.61, 0.36, 1] // Smooth deceleration
		}
	}),

	/**
	 * Subtle scale and fade in - good for cards and items
	 */
	fadeInScale: (delay = 0): MotionParams => ({
		keyframes: {
			opacity: [0, 1],
			scale: [0.95, 1]
		},
		options: {
			duration: 0.35,
			delay,
			ease: [0.34, 1.56, 0.64, 1] // Subtle bounce
		}
	}),

	/**
	 * Slide in from right - good for menus and toolbars
	 */
	slideInRight: (delay = 0): MotionParams => ({
		keyframes: {
			opacity: [0, 1],
			x: [12, 0]
		},
		options: {
			duration: 0.3,
			delay,
			ease: [0.16, 1, 0.3, 1] // Smooth entrance
		}
	}),

	/**
	 * Slide in from left
	 */
	slideInLeft: (delay = 0): MotionParams => ({
		keyframes: {
			opacity: [0, 1],
			x: [-12, 0]
		},
		options: {
			duration: 0.3,
			delay,
			ease: [0.16, 1, 0.3, 1]
		}
	}),

	/**
	 * Simple fade in
	 */
	fadeIn: (delay = 0): MotionParams => ({
		keyframes: {
			opacity: [0, 1]
		},
		options: {
			duration: 0.2,
			delay,
			ease: [0.22, 0.61, 0.36, 1]
		}
	})
};
