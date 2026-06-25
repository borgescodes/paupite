const logoModules = import.meta.glob(
  "../data/fifa-world-cup-2026.football-logos.cc/128x128/*.png",
  { eager: true, import: "default" },
) as Record<string, string>;

function logo(filename: string): string {
  const key = `../data/fifa-world-cup-2026.football-logos.cc/128x128/${filename}`;
  return logoModules[key] ?? "";
}

const FLAG_TO_LOGO: Record<string, string> = {
  ar: logo("argentina-national-team.football-logos.cc.png"),
  at: logo("austria-national-team.football-logos.cc.png"),
  au: logo("australia-national-team.football-logos.cc.png"),
  ba: logo("bosnia-and-herzegovina-national-team.football-logos.cc.png"),
  be: logo("belgium-national-team.football-logos.cc.png"),
  br: logo("brazil-national-team.football-logos.cc.png"),
  ca: logo("canada-national-team.football-logos.cc.png"),
  cd: logo("congo-dr-national-team.football-logos.cc.png"),
  ch: logo("switzerland-national-team.football-logos.cc.png"),
  ci: logo("cote-d-ivoire-national-team.football-logos.cc.png"),
  co: logo("colombia-national-team.football-logos.cc.png"),
  cv: logo("cabo-verde-national-team.football-logos.cc.png"),
  cw: logo("curacao-national-team.football-logos.cc.png"),
  cz: logo("czech-republic-national-team.football-logos.cc.png"),
  de: logo("germany-national-team.football-logos.cc.png"),
  dz: logo("algeria-national-team.football-logos.cc.png"),
  ec: logo("ecuador-national-team.football-logos.cc.png"),
  eg: logo("egypt-national-team.football-logos.cc.png"),
  es: logo("spain-national-team.football-logos.cc.png"),
  fr: logo("france-national-team.football-logos.cc.png"),
  "gb-eng": logo("england-national-team.football-logos.cc.png"),
  "gb-sct": logo("scotland-national-team.football-logos.cc.png"),
  gh: logo("ghana-national-team.football-logos.cc.png"),
  hr: logo("croatia-national-team.football-logos.cc.png"),
  ht: logo("haiti-national-team.football-logos.cc.png"),
  iq: logo("iraq-national-team.football-logos.cc.png"),
  ir: logo("iran-national-team.football-logos.cc.png"),
  jo: logo("jordan-national-team.football-logos.cc.png"),
  jp: logo("japan-national-team.football-logos.cc.png"),
  kr: logo("south-korea-national-team.football-logos.cc.png"),
  ma: logo("morocco-national-team.football-logos.cc.png"),
  mx: logo("mexico-national-team.football-logos.cc.png"),
  nl: logo("dutch-national-team.football-logos.cc.png"),
  no: logo("norway-national-team.football-logos.cc.png"),
  nz: logo("new-zealand-national-team.football-logos.cc.png"),
  pa: logo("panama-national-team.football-logos.cc.png"),
  pt: logo("portuguese-football-federation.football-logos.cc.png"),
  py: logo("paraguay-national-team.football-logos.cc.png"),
  qa: logo("qatar-national-team.football-logos.cc.png"),
  sa: logo("saudi-arabia-national-team.football-logos.cc.png"),
  se: logo("sweden-national-team.football-logos.cc.png"),
  sn: logo("senegal-national-team.football-logos.cc.png"),
  tn: logo("tunisia-national-team.football-logos.cc.png"),
  tr: logo("turkey-national-team.football-logos.cc.png"),
  us: logo("usa-national-team.football-logos.cc.png"),
  uy: logo("uruguay-national-team.football-logos.cc.png"),
  uz: logo("uzbekistan-national-team.football-logos.cc.png"),
  za: logo("south-africa-national-team.football-logos.cc.png"),
};

export function getTeamLogoUrl(flagCode: string): string | undefined {
  const url = FLAG_TO_LOGO[flagCode];
  return url || undefined;
}
