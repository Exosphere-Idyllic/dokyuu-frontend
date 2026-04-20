import { Injectable, signal } from '@angular/core';

export type ThemeId = 'dark' | 'light' | 'roses' | 'ponci';

export interface Theme {
    id: ThemeId;
    name: string;
    description: string;
    colors: {
        bg: string;
        surface: string;
        accent: string;
        accentHover: string;
        preview: string[];
    };
}

export const THEMES: Theme[] = [
    {
        id: 'dark',
        name: 'Dark',
        description: 'Oscuro profesional',
        colors: {
            bg: '#0A0A0C',
            surface: '#121215',
            accent: '#00F0FF',
            accentHover: '#00C8D4',
            preview: ['#0A0A0C', '#121215', '#00F0FF'],
        },
    },
    {
        id: 'light',
        name: 'Light',
        description: 'Claro y limpio',
        colors: {
            bg: '#F4F4F6',
            surface: '#FFFFFF',
            accent: '#0066CC',
            accentHover: '#0052A3',
            preview: ['#F4F4F6', '#FFFFFF', '#0066CC'],
        },
    },
    {
        id: 'roses',
        name: 'Roses',
        description: 'Magenta y violeta',
        colors: {
            bg: '#120A12',
            surface: '#1A0D1A',
            accent: '#EC4899',
            accentHover: '#DB2777',
            preview: ['#120A12', '#1A0D1A', '#EC4899'],
        },
    },
    {
        id: 'ponci',
        name: 'Ponci',
        description: 'Cafés y rojizos',
        colors: {
            bg: '#120A06',
            surface: '#1A0F0A',
            accent: '#C2622D',
            accentHover: '#A0501F',
            preview: ['#120A06', '#1A0F0A', '#C2622D'],
        },
    },
];

@Injectable({ providedIn: 'root' })
export class ThemeService {
    private readonly STORAGE_KEY = 'dokyuu_theme';

    public currentTheme = signal<ThemeId>(this.loadFromStorage());

    constructor() {
        this.applyTheme(this.currentTheme());
    }

    setTheme(id: ThemeId) {
        this.currentTheme.set(id);
        localStorage.setItem(this.STORAGE_KEY, id);
        this.applyTheme(id);
    }

    private loadFromStorage(): ThemeId {
        const stored = localStorage.getItem(this.STORAGE_KEY) as ThemeId | null;
        return stored && THEMES.find(t => t.id === stored) ? stored : 'dark';
    }

    private applyTheme(id: ThemeId) {
        document.documentElement.setAttribute('data-theme', id);
    }
}