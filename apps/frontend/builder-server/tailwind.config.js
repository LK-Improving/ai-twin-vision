/** @type {import('tailwindcss').Config} */
// 科技白主题：浅色为主，蓝青主色 + 青色强调
module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主色：蓝青系
        primary: {
          50: '#e6f0ff',
          100: '#cce0ff',
          200: '#99c2ff',
          300: '#66a3ff',
          400: '#3385ff',
          500: '#1677ff',
          600: '#0958d9',
          700: '#0a4ec0',
          800: '#0a43a3',
          900: '#0a3886',
        },
        // 强调色：青色
        accent: {
          50: '#e6fffb',
          100: '#b5f5ec',
          200: '#87e8de',
          300: '#5cdbd3',
          400: '#36cfc9',
          500: '#13c2c2',
          600: '#08979c',
          700: '#006d75',
        },
        // 表面：白 / 浅灰阶
        surface: {
          DEFAULT: '#ffffff',
          soft: '#f7f9fc',
          muted: '#eef2f7',
        },
        // 文字灰阶
        ink: {
          DEFAULT: '#1f2937',
          soft: '#4b5563',
          muted: '#9ca3af',
        },
        success: {
          DEFAULT: '#16a34a',
          soft: '#dcfce7',
        },
        warning: {
          DEFAULT: '#d97706',
          soft: '#fef3c7',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        panel: '0 4px 16px -4px rgba(15, 23, 42, 0.10), 0 2px 6px -2px rgba(15, 23, 42, 0.06)',
        glow: '0 0 0 3px rgba(22, 119, 255, 0.12)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      backgroundImage: {
        'tech-grid':
          'linear-gradient(rgba(22,119,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(22,119,255,0.06) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
