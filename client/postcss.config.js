import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const tw = tailwindcss();

export default {
  plugins: [
    {
      postcssPlugin: 'conditional-tailwindcss',
      Once(root, helpers) {
        const file = root.source?.input?.file || '';
        if (file.includes('node_modules')) {
          return;
        }
        if (typeof tw.Once === 'function') {
          return tw.Once(root, helpers);
        } else if (typeof tw === 'function') {
          return tw(root, helpers);
        }
      }
    },
    autoprefixer()
  ]
};
