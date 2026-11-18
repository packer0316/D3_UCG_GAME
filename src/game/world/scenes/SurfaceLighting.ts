/** Local microfacet lighting; display-space output preserves the game's legacy colour pipeline. */
export const MICROFACET_GLSL = /* glsl */ `
  vec3 schlickFresnel(vec3 f0,float cosine){return f0+(1.-f0)*pow(1.-clamp(cosine,0.,1.),5.);}
  vec3 ggxSpecular(vec3 N,vec3 V,vec3 L,vec3 f0,float roughness){
    vec3 H=normalize(V+L);
    float nv=max(dot(N,V),.001),nl=max(dot(N,L),.001),nh=max(dot(N,H),0.);
    float a=max(.055,roughness*roughness),a2=a*a;
    float denom=nh*nh*(a2-1.)+1.;
    float D=a2/(3.14159265*denom*denom);
    float gv=nl*sqrt(nv*nv*(1.-a2)+a2),gl=nv*sqrt(nl*nl*(1.-a2)+a2);
    return D*.5/max(gv+gl,.00001)*schlickFresnel(f0,max(dot(V,H),0.))*nl;
  }
  // Broad studio sky and narrow warm horizon; small objects remain legible in all legacy scenes.
  vec3 gardenEnvironment(vec3 R,float roughness){
    vec3 c=mix(vec3(.17,.23,.29),vec3(.62,.76,.87),smoothstep(-.3,.85,R.z));
    c+=vec3(.8,.61,.34)*pow(max(dot(R,normalize(vec3(-.6,-.8,.8))),0.),mix(64.,4.,roughness));
    c+=vec3(.18,.35,.46)*pow(max(dot(R,normalize(vec3(.7,.5,.3))),0.),mix(32.,3.,roughness));
    return c;
  }
`;
