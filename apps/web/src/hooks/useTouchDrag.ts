import { useState, useCallback, useRef, useEffect } from 'react';

export interface TouchDragState<T> {
    isDragging: boolean;
    data: T | null;
    position: { x: number; y: number } | null;
}

export interface UseTouchDragOptions<T> {
    onDragStart?: (data: T) => void;
    onDragEnd?: (data: T | null) => void;
    onDrop?: (data: T, target: Element | null) => void;
}

export function useTouchDrag<T>(options: UseTouchDragOptions<T> = {}) {
    const [state, setState] = useState<TouchDragState<T>>({
        isDragging: false,
        data: null,
        position: null,
    });

    const dataRef = useRef<T | null>(null);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    const hasMoved = useRef(false);

    const startDrag = useCallback((data: T, touch: React.Touch) => {
        dataRef.current = data;
        startPosRef.current = { x: touch.clientX, y: touch.clientY };
        hasMoved.current = false;

        setState({
            isDragging: true,
            data,
            position: { x: touch.clientX, y: touch.clientY },
        });

        options.onDragStart?.(data);

        // Prevent text selection and scrolling while dragging
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
    }, [options]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!dataRef.current) return;

        const touch = e.touches[0];
        if (!touch) return;

        // Check if we've moved enough to consider it a drag
        if (startPosRef.current) {
            const dx = touch.clientX - startPosRef.current.x;
            const dy = touch.clientY - startPosRef.current.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved.current = true;
            }
        }

        if (hasMoved.current) {
            e.preventDefault(); // Prevent scrolling while dragging
        }

        setState(prev => ({
            ...prev,
            position: { x: touch.clientX, y: touch.clientY },
        }));
    }, []);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        const data = dataRef.current;

        // Restore body styles
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';

        if (!data || !hasMoved.current) {
            // Not a drag, just a tap - reset state
            setState({ isDragging: false, data: null, position: null });
            dataRef.current = null;
            startPosRef.current = null;
            return;
        }

        // Find element under the touch point
        const touch = e.changedTouches[0];
        if (touch) {
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            options.onDrop?.(data, target);
        }

        options.onDragEnd?.(data);

        setState({ isDragging: false, data: null, position: null });
        dataRef.current = null;
        startPosRef.current = null;
        hasMoved.current = false;
    }, [options]);

    // Add global touch listeners when dragging
    useEffect(() => {
        if (state.isDragging) {
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
            document.addEventListener('touchcancel', handleTouchEnd);

            return () => {
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
                document.removeEventListener('touchcancel', handleTouchEnd);
            };
        }
    }, [state.isDragging, handleTouchMove, handleTouchEnd]);

    const cancelDrag = useCallback(() => {
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';

        options.onDragEnd?.(dataRef.current);
        setState({ isDragging: false, data: null, position: null });
        dataRef.current = null;
        startPosRef.current = null;
        hasMoved.current = false;
    }, [options]);

    return {
        ...state,
        startDrag,
        cancelDrag,
    };
}
