# Vendored ceoloide ergogen footprints

Source: https://github.com/ceoloide/ergogen-footprints (MIT license, see `LICENSE`).

These files are kept here as a **geometry reference**. The codebase does not
evaluate them at runtime — they're written against ergogen's runtime helpers
(`p.eaxy`, `p.local_net`, etc.) and would require an ergogen shim to invoke
directly. Instead, `src/lib/mcu.ts` and `src/lib/serialize/kicadPcb.ts`
replicate the silkscreen and pad geometry from these files in TypeScript.

When a footprint here is updated upstream, eyeball the diff and port any
geometry changes by hand.
