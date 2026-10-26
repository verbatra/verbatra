export type BrandMarkSourceId =
  | "simple-icons"
  | "lobe-icons"
  | "font-awesome-free"
  | "devicon"
  | "dotnet-brand";

export type BrandMarkSource = {
  readonly package: string;
  readonly version: string;
  readonly license: string;
  readonly repository: string;
  readonly fileBase: string;
};

export type BrandMark = {
  readonly title: string;
  readonly source: BrandMarkSourceId;
  readonly file: string;
  readonly license: string;
  readonly attribution: ReadonlyArray<string>;
  readonly path: string;
  readonly fillRule: "nonzero" | "evenodd";
  readonly viewBox?: string;
};

export const BRAND_MARK_TRADEMARK_NOTE =
  "Logos are trademarks of their owners, used to identify compatibility.";

export const BRAND_MARK_SOURCES: Readonly<Record<BrandMarkSourceId, BrandMarkSource>> = {
  "simple-icons": {
    package: "simple-icons",
    version: "16.35.0",
    license: "CC0-1.0",
    repository: "https://github.com/simple-icons/simple-icons",
    fileBase: "https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/",
  },
  "lobe-icons": {
    package: "@lobehub/icons-static-svg",
    version: "1.95.1",
    license: "MIT",
    repository: "https://github.com/lobehub/lobe-icons",
    fileBase: "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/",
  },
  "font-awesome-free": {
    package: "@fortawesome/fontawesome-free",
    version: "7.3.1",
    license: "CC-BY-4.0",
    repository: "https://github.com/FortAwesome/Font-Awesome",
    fileBase: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.3.1/",
  },
  "dotnet-brand": {
    package: "dotnet/brand",
    version: "91845f6ddf2123b3bb1bfd1b6a386d9ce02b43aa",
    license: "Brand permission (dotnet/brand README)",
    repository: "https://github.com/dotnet/brand",
    fileBase: "https://cdn.jsdelivr.net/gh/dotnet/brand@91845f6ddf2123b3bb1bfd1b6a386d9ce02b43aa/",
  },
  devicon: {
    package: "devicon",
    version: "2.18.0",
    license: "MIT",
    repository: "https://github.com/devicons/devicon",
    fileBase: "https://cdn.jsdelivr.net/gh/devicons/devicon@v2.18.0/",
  },
};

export const BRAND_MARKS = {
  angular: {
    title: "Angular",
    source: "simple-icons",
    file: "icons/angular.svg",
    license: "CC-BY-4.0",
    attribution: [
      "Angular logo by Google (https://angular.dev/press-kit), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
      "Changed: redrawn in one color by Simple Icons and filled with the page's text color.",
    ],
    fillRule: "nonzero",
    path: "M16.712 17.711H7.288l-1.204 2.916L12 24l5.916-3.373-1.204-2.916ZM14.692 0l7.832 16.855.814-12.856L14.692 0ZM9.308 0 .662 3.999l.814 12.856L9.308 0Zm-.405 13.93h6.198L12 6.396 8.903 13.93Z",
  },
  android: {
    title: "Android",
    source: "simple-icons",
    file: "icons/android.svg",
    license: "CC-BY-3.0",
    attribution: [
      "The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License (https://creativecommons.org/licenses/by/3.0/).",
      "Changed: redrawn in one color by Simple Icons and filled with the page's text color.",
    ],
    fillRule: "nonzero",
    path: "M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z",
  },
  openai: {
    title: "OpenAI",
    source: "lobe-icons",
    file: "icons/openai.svg",
    license: "MIT",
    attribution: [
      "Copyright (c) 2023 LobeHub",
      "MIT License: https://github.com/lobehub/lobe-icons/blob/49a2130df7bfa5eb1b088261bff20a37e2967789/LICENSE (the commit npm records for 1.95.1).",
    ],
    fillRule: "evenodd",
    path: "M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z",
  },
  react: {
    title: "React",
    source: "simple-icons",
    file: "icons/react.svg",
    license: "MIT",
    attribution: [
      "Copyright (c) 2013-present, Facebook, Inc.",
      "MIT License: https://github.com/facebook/create-react-app/blob/282c03f9525fdf8061ffa1ec50dce89296d916bd/LICENSE (the repository holding the logo.svg that Simple Icons records as this icon's source).",
    ],
    fillRule: "nonzero",
    path: "M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z",
  },
  fontawesomeApple: {
    title: "Apple",
    source: "font-awesome-free",
    file: "svgs/brands/apple.svg",
    license: "CC-BY-4.0",
    attribution: [
      "Font Awesome Free 7.3.1 by @fontawesome (https://fontawesome.com), Apple icon, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2026 Fonticons, Inc.",
      "Changed: filled with the page's text color (currentColor) and scaled to fit the stack card chip.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 384 512",
    path: "M319.1 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7-55.8 .9-115.1 44.5-115.1 133.2 0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.5 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z",
  },
  fontawesomeFlutter: {
    title: "Flutter",
    source: "font-awesome-free",
    file: "svgs/brands/flutter.svg",
    license: "CC-BY-4.0",
    attribution: [
      "Font Awesome Free 7.3.1 by @fontawesome (https://fontawesome.com), Flutter icon, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2026 Fonticons, Inc.",
      "Changed: filled with the page's text color (currentColor) and scaled to fit the stack card chip.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 448 512",
    path: "M429.5 236.3L291.7 374.1 429.5 512 272 512c-36.1-36.1-82.1-82.1-137.9-137.9l137.9-137.8 157.5 0zM272 0L16 256 94.8 334.8 429.5 0 272 0z",
  },
  fontawesomeVuejs: {
    title: "Vue",
    source: "font-awesome-free",
    file: "svgs/brands/vuejs.svg",
    license: "CC-BY-4.0",
    attribution: [
      "Font Awesome Free 7.3.1 by @fontawesome (https://fontawesome.com), Vue.js icon, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2026 Fonticons, Inc.",
      "Changed: filled with the page's text color (currentColor) and scaled to fit the stack card chip.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 448 512",
    path: "M356.9 64.3l-76.9 0-56 88.6-48-88.6-176 0 224 383.7 224-383.7-91.1 0zM55.7 96.3l53.8 0 114.5 198.2 114.4-198.2 53.8 0-168.2 288.2-168.3-288.2z",
  },
  deviconSpring: {
    title: "Spring",
    source: "devicon",
    file: "icons/spring/spring-original.svg",
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/spring/spring-original.svg). Drawn in one color and filled with the page's text color.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "M116.452 6.643a59.104 59.104 0 01-6.837 12.136A64.249 64.249 0 0064.205-.026C28.984-.026 0 28.982 0 64.242a64.316 64.316 0 0019.945 46.562l2.368 2.1a64.22 64.22 0 0041.358 15.122c33.487 0 61.637-26.24 64.021-59.683 1.751-16.371-3.051-37.077-11.24-61.7zM29.067 111.17a5.5 5.5 0 01-4.269 2.034c-3.018 0-5.487-2.484-5.487-5.502 0-3.017 2.485-5.501 5.487-5.501 1.25 0 2.485.433 3.452 1.234 2.351 1.9 2.718 5.384.817 7.735zm87.119-19.238c-15.843 21.122-49.68 14.003-71.376 15.02 0 0-3.852.234-7.721.867 0 0 1.45-.617 3.335-1.334 15.226-5.301 22.43-6.335 31.685-11.086 17.427-8.869 34.654-28.274 38.24-48.463-6.637 19.422-26.75 36.11-45.077 42.895-12.557 4.635-35.238 9.136-35.238 9.136l-.917-.484c-15.442-7.518-15.91-40.977 12.157-51.78 12.291-4.735 24.048-2.134 37.323-5.302 14.175-3.367 30.568-14.004 37.238-27.874 7.471 22.19 16.46 56.932.35 78.405z",
  },
  deviconNextjs: {
    title: "Next.js",
    source: "devicon",
    file: "icons/nextjs/nextjs-plain.svg",
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/nextjs/nextjs-plain.svg). Drawn in one color and filled with the page's text color.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "M64 0A64 64 0 0 0 0 64a64 64 0 0 0 64 64 64 64 0 0 0 35.508-10.838L47.014 49.34v40.238H38.4V38.4h10.768l57.125 73.584A64 64 0 0 0 128 64 64 64 0 0 0 64 0Zm17.777 38.4h8.534v48.776L81.777 75.97Zm24.18 73.92-.111.096a64 64 0 0 0 .111-.096z",
  },
  deviconNuxt: {
    title: "Nuxt",
    source: "devicon",
    file: "icons/nuxt/nuxt-original.svg",
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/nuxt/nuxt-original.svg). Drawn in one color and filled with the page's text color.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "M71.679 106.667h47.359c1.514 0 2.962-.533 4.268-1.283 1.307-.75 2.66-1.688 3.415-2.986.755-1.298 1.279-2.769 1.279-4.264s-.524-2.971-1.279-4.268l-32-55.038c-.755-1.297-1.68-2.24-2.99-2.991-1.312-.751-3.18-1.279-4.695-1.279-1.514 0-2.957.533-4.263 1.279-1.307.746-2.232 1.693-2.987 2.991l-8.108 14.08-16.213-27.311c-.755-1.297-1.68-2.66-2.986-3.41-1.307-.75-2.755-.854-4.269-.854-1.514 0-2.957.104-4.264.854-1.306.75-2.66 2.113-3.415 3.41L.854 93.864C.099 95.161 0 96.634 0 98.134c0 1.499.099 2.966.854 4.263.754 1.297 2.103 2.24 3.415 2.986 1.311.747 2.754 1.284 4.264 1.284H38.4c11.835 0 20.449-5.31 26.453-15.364l14.505-25.17 7.678-13.226 23.468 40.104H79.359ZM37.97 93.01H17.066l31.147-53.76L64 66.134 53.543 84.361c-3.986 6.523-8.533 8.65-15.572 8.65zm0 0",
  },
  dotnet: {
    title: ".NET",
    source: "dotnet-brand",
    file: "logo/dotnet-logo.svg",
    license: "Brand permission (dotnet/brand README)",
    attribution: [
      'The .NET logo is copyright of the .NET authors. dotnet/brand README, License section: "use the illustrations and logo to represent .NET in related content, per the .NET Brand Guidelines. The .NET brand guidelines and .NET logo are copyright of the .NET authors." (https://github.com/dotnet/brand/blob/91845f6ddf2123b3bb1bfd1b6a386d9ce02b43aa/README.md).',
      "Changed: the square drawn in one color with the lettering knocked out, filled with the page's text color.",
    ],
    fillRule: "evenodd",
    viewBox: "0 0 456 456",
    path: "M0 0H456V456H0ZM81.2738 291.333C78.0496 291.333 75.309 290.259 73.052 288.11C70.795 285.906 69.6665 283.289 69.6665 280.259C69.6665 277.173 70.795 274.529 73.052 272.325C75.309 270.121 78.0496 269.019 81.2738 269.019C84.5518 269.019 87.3193 270.121 89.5763 272.325C91.887 274.529 93.0424 277.173 93.0424 280.259C93.0424 283.289 91.887 285.906 89.5763 288.11C87.3193 290.259 84.5518 291.333 81.2738 291.333ZM210.167 289.515H189.209L133.994 202.406C132.597 200.202 131.441 197.915 130.528 195.546H130.044C130.474 198.081 130.689 203.508 130.689 211.827V289.515H112.149V171H134.477L187.839 256.043C190.096 259.57 191.547 261.994 192.192 263.316H192.514C191.977 260.176 191.708 254.859 191.708 247.365V171H210.167V289.515ZM300.449 289.515H235.561V171H297.87V187.695H254.746V221.249H294.485V237.861H254.746V272.903H300.449V289.515ZM392.667 187.695H359.457V289.515H340.272V187.695H307.143V171H392.667V187.695Z",
  },
  deviconYaml: {
    title: "YAML",
    source: "devicon",
    file: "icons/yaml/yaml-plain.svg",
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/yaml/yaml-plain.svg). Drawn in one color and filled with the page's text color.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "m0.5 5.6289 21.754 34.15v21.646h13.959v-21.646l22.775-34.15h-15.02l-13.947 21.988-13.832-21.988h-15.689zm63.994 0.13086-23.66 55.797h11.189l5.1387-12.408h25.266l4.252 12.408h11.957l-22.699-55.797h-11.443zm5.9922 11.773 7.7441 20.475h-16.387l8.6426-20.475zm16.195 50.139v54.451h40.818v-11.635-0.00195h-28.863v-42.814h-11.955zm-64.428 0.011719v54.687h11.734v-37.723l12.279 25.355h9.2344l12.699-26.246v38.602h11.256v-54.676h-15.369l-13.637 24.732-12.986-24.732h-15.211z",
  },
} as const satisfies Readonly<Record<string, BrandMark>>;

export type BrandMarkId = keyof typeof BRAND_MARKS;

export const BRAND_MARK_IDS = Object.keys(BRAND_MARKS) as ReadonlyArray<BrandMarkId>;

export function brandMarkSourceUrl(mark: BrandMark): string {
  return `${BRAND_MARK_SOURCES[mark.source].fileBase}${mark.file}`;
}
