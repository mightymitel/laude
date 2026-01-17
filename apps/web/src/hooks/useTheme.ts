import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'laudasist_theme';

/**
 * Hook to manage theme state with localStorage persistence + system preference fallback
 */
export function useTheme() {
    const [theme, setTheme] = useState<Theme>('system');

    // Initialize theme from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(THEME_KEY) as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            setTheme(stored);
        }
    }, []);

    // Apply theme to document
    useEffect(() => {
        const root = document.documentElement;

        if (theme === 'system') {
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', theme);
        }

        // Save to localStorage
        localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    // Toggle between light/dark (skips system)
    const toggleTheme = useCallback(() => {
        setTheme((current) => {
            if (current === 'dark') return 'light';
            return 'dark';
        });
    }, []);

    // Set specific theme
    const setThemeValue = useCallback((newTheme: Theme) => {
        setTheme(newTheme);
    }, []);

    // Compute if currently dark
    const isDark = theme === 'dark' || (
        theme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    return {
        theme,
        isDark,
        toggleTheme,
        setTheme: setThemeValue,
    };
}
