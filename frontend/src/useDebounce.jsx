import { useState, useEffect, useRef } from 'react';

export function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    const handler = useRef(null);

    useEffect(() => {
        handler.current = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler.current);
        };
    }, [value, delay]);

    return debouncedValue;
}