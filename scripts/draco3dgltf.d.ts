// draco3dgltf ships no TypeScript types; declare the minimal surface
// inspect-glb.ts uses (decoder module factory for gltf-transform).
declare module 'draco3dgltf' {
  const draco3dgltf: {
    createDecoderModule(): Promise<unknown>;
    createEncoderModule(): Promise<unknown>;
  };
  export default draco3dgltf;
}
