import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: TooltipPlacement;
  align?: TooltipAlign;
  disabled?: boolean;
  offset?: number;
  maxWidth?: number;
}

interface TooltipTextProps {
  content: string;
  children?: React.ReactNode;
  className?: string;
  placement?: TooltipPlacement;
  align?: TooltipAlign;
  disabled?: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
  actualPlacement: TooltipPlacement;
  arrowLeft?: number;
  arrowTop?: number;
}

const VIEWPORT_MARGIN = 10;
const ARROW_SIZE = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolvePortalRoot = (node: HTMLElement | null) => {
  if (!node) return null;
  const doc = node.ownerDocument;
  return (doc.querySelector('.light, .dark') as HTMLElement | null) ?? doc.body;
};

const mergeRefs = <T,>(...refs: Array<React.Ref<T> | undefined>) => (value: T | null) => {
  refs.forEach((ref) => {
    if (!ref) return;
    if (typeof ref === 'function') {
      ref(value);
      return;
    }
    (ref as React.MutableRefObject<T | null>).current = value;
  });
};

const runHandler = <E,>(
  handler: ((event: E) => void) | undefined,
  event: E
) => {
  handler?.(event);
};

export function Tooltip({
  content,
  children,
  placement = 'top',
  align = 'center',
  disabled = false,
  offset = 10,
  maxWidth = 280
}: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const portalRoot = useMemo(() => resolvePortalRoot(triggerRef.current), [open]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const rect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let actualPlacement = placement;

    if (placement === 'top' && rect.top - bubbleRect.height - offset < VIEWPORT_MARGIN) {
      actualPlacement = 'bottom';
    } else if (placement === 'bottom' && rect.bottom + bubbleRect.height + offset > viewportHeight - VIEWPORT_MARGIN) {
      actualPlacement = 'top';
    } else if (placement === 'left' && rect.left - bubbleRect.width - offset < VIEWPORT_MARGIN) {
      actualPlacement = 'right';
    } else if (placement === 'right' && rect.right + bubbleRect.width + offset > viewportWidth - VIEWPORT_MARGIN) {
      actualPlacement = 'left';
    }

    let top = 0;
    let left = 0;

    if (actualPlacement === 'top' || actualPlacement === 'bottom') {
      if (align === 'start') {
        left = rect.left;
      } else if (align === 'end') {
        left = rect.right - bubbleRect.width;
      } else {
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;
      }

      top = actualPlacement === 'top'
        ? rect.top - bubbleRect.height - offset
        : rect.bottom + offset;
    } else {
      if (align === 'start') {
        top = rect.top;
      } else if (align === 'end') {
        top = rect.bottom - bubbleRect.height;
      } else {
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
      }

      left = actualPlacement === 'left'
        ? rect.left - bubbleRect.width - offset
        : rect.right + offset;
    }

    left = clamp(left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportWidth - bubbleRect.width - VIEWPORT_MARGIN));
    top = clamp(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewportHeight - bubbleRect.height - VIEWPORT_MARGIN));

    const nextPosition: TooltipPosition = {
      top,
      left,
      actualPlacement
    };

    if (actualPlacement === 'top' || actualPlacement === 'bottom') {
      nextPosition.arrowLeft = clamp(
        rect.left + rect.width / 2 - left - ARROW_SIZE / 2,
        12,
        Math.max(12, bubbleRect.width - 12 - ARROW_SIZE)
      );
    } else {
      nextPosition.arrowTop = clamp(
        rect.top + rect.height / 2 - top - ARROW_SIZE / 2,
        12,
        Math.max(12, bubbleRect.height - 12 - ARROW_SIZE)
      );
    }

    setPosition(nextPosition);
  }, [align, offset, placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();

    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
  }, [content, open, updatePosition]);

  const child = React.Children.only(children) as React.ReactElement<any> & { ref?: React.Ref<HTMLElement> };
  const childProps = child.props as Record<string, unknown>;
  const childAriaLabel = childProps['aria-label'];

  const clonedChild = React.cloneElement(child, {
    ref: mergeRefs<HTMLElement>(child.ref, (value) => {
      triggerRef.current = value;
    }),
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      runHandler(childProps.onMouseEnter as ((event: React.MouseEvent<HTMLElement>) => void) | undefined, event);
      if (!disabled && content) setOpen(true);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      runHandler(childProps.onMouseLeave as ((event: React.MouseEvent<HTMLElement>) => void) | undefined, event);
      setOpen(false);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      runHandler(childProps.onFocus as ((event: React.FocusEvent<HTMLElement>) => void) | undefined, event);
      if (!disabled && content) setOpen(true);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      runHandler(childProps.onBlur as ((event: React.FocusEvent<HTMLElement>) => void) | undefined, event);
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
      setOpen(false);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      runHandler(childProps.onKeyDown as ((event: React.KeyboardEvent<HTMLElement>) => void) | undefined, event);
      if (event.key === 'Escape') setOpen(false);
    },
    'aria-describedby': open ? tooltipId : undefined,
    'aria-label': childAriaLabel ?? (typeof content === 'string' ? content : undefined)
  } as Record<string, unknown>);

  return (
    <>
      {clonedChild}
      {open && portalRoot && createPortal(
        <div
          id={tooltipId}
          ref={bubbleRef}
          role="tooltip"
          className="app-tooltip-bubble"
          data-placement={position?.actualPlacement ?? placement}
          style={{
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            maxWidth,
            opacity: position ? 1 : 0
          }}
        >
          <span className="app-tooltip-label">{content}</span>
          <span
            className="app-tooltip-arrow"
            style={{
              left: position?.arrowLeft,
              top: position?.arrowTop
            }}
          />
        </div>,
        portalRoot
      )}
    </>
  );
}

export function TooltipText({
  content,
  children,
  className,
  placement = 'top',
  align = 'center',
  disabled = false
}: TooltipTextProps) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const updateOverflow = useCallback(() => {
    const element = textRef.current;
    if (!element) {
      setOverflowing(false);
      return;
    }
    setOverflowing(
      element.scrollWidth > element.clientWidth + 1 ||
      element.scrollHeight > element.clientHeight + 1
    );
  }, []);

  useLayoutEffect(() => {
    updateOverflow();
  }, [content, children, className, updateOverflow]);

  useEffect(() => {
    window.addEventListener('resize', updateOverflow);
    return () => window.removeEventListener('resize', updateOverflow);
  }, [updateOverflow]);

  return (
    <Tooltip
      content={content}
      placement={placement}
      align={align}
      disabled={disabled || !overflowing}
    >
      <span ref={textRef} className={className}>
        {children ?? content}
      </span>
    </Tooltip>
  );
}
