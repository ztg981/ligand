export default {
  plugins: {
    tailwindcss: {},
    // remove:false keeps author-written vendor prefixes instead of stripping
    // ones autoprefixer deems "outdated". Critical for backdrop-filter: without
    // it, autoprefixer removed our hand-written `-webkit-backdrop-filter`,
    // leaving only the standard property — so the frosted-glass blur silently
    // broke on iOS/Safari < 18 (which supports only the -webkit- form).
    autoprefixer: { remove: false },
  },
};
