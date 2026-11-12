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

export type BrandMarkColor = {
  readonly hex: string;
  readonly source: string;
};

export type BrandMark = {
  readonly title: string;
  readonly source: BrandMarkSourceId;
  readonly file: string;
  readonly license: string;
  readonly color: BrandMarkColor;
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
    color: {
      hex: "#0F0F11",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "angular"',
    },
    license: "CC-BY-4.0",
    attribution: [
      "Angular logo by Google (https://angular.dev/press-kit), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
      "Changed: redrawn in one color by Simple Icons and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "nonzero",
    path: "M16.712 17.711H7.288l-1.204 2.916L12 24l5.916-3.373-1.204-2.916ZM14.692 0l7.832 16.855.814-12.856L14.692 0ZM9.308 0 .662 3.999l.814 12.856L9.308 0Zm-.405 13.93h6.198L12 6.396 8.903 13.93Z",
  },
  android: {
    title: "Android",
    source: "simple-icons",
    file: "icons/android.svg",
    color: {
      hex: "#3DDC84",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "android"',
    },
    license: "CC-BY-3.0",
    attribution: [
      "The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License (https://creativecommons.org/licenses/by/3.0/).",
      "Changed: redrawn in one color by Simple Icons and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "nonzero",
    path: "M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z",
  },
  openai: {
    title: "OpenAI",
    source: "lobe-icons",
    file: "icons/openai.svg",
    color: {
      hex: "#000000",
      source:
        "Lobe Icons commit 49a2130df7bfa5eb1b088261bff20a37e2967789, src/OpenAI/style.ts COLOR_PRIMARY",
    },
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
    color: {
      hex: "#61DAFB",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "react"',
    },
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
    color: {
      hex: "#000000",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "apple"',
    },
    license: "CC-BY-4.0",
    attribution: [
      "Font Awesome Free 7.3.1 by @fontawesome (https://fontawesome.com), Apple icon, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2026 Fonticons, Inc.",
      "Changed: filled with the brand color (the page's text color in a theme where the brand color lacks contrast) and scaled to fit the stack card chip.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 384 512",
    path: "M319.1 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7-55.8 .9-115.1 44.5-115.1 133.2 0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.5 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z",
  },
  fontawesomeFlutter: {
    title: "Flutter",
    source: "font-awesome-free",
    file: "svgs/brands/flutter.svg",
    color: {
      hex: "#02569B",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "flutter"',
    },
    license: "CC-BY-4.0",
    attribution: [
      "Font Awesome Free 7.3.1 by @fontawesome (https://fontawesome.com), Flutter icon, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2026 Fonticons, Inc.",
      "Changed: filled with the brand color (the page's text color in a theme where the brand color lacks contrast) and scaled to fit the stack card chip.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 448 512",
    path: "M429.5 236.3L291.7 374.1 429.5 512 272 512c-36.1-36.1-82.1-82.1-137.9-137.9l137.9-137.8 157.5 0zM272 0L16 256 94.8 334.8 429.5 0 272 0z",
  },
  fontawesomeVuejs: {
    title: "Vue",
    source: "font-awesome-free",
    file: "svgs/brands/vuejs.svg",
    color: {
      hex: "#4FC08D",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "vuedotjs"',
    },
    license: "CC-BY-4.0 (Font Awesome drawing), CC-BY-NC-SA-4.0 (Vue logo artwork)",
    attribution: [
      "Font Awesome Free 7.3.1 by @fontawesome (https://fontawesome.com), Vue.js icon, drawing licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2026 Fonticons, Inc. Font Awesome states that its brand icons stay the trademarks and artwork of their owners.",
      "The Vue logo is designed by Evan You and published in vuejs/art (https://github.com/vuejs/art) under CC BY-NC-SA 4.0 (http://creativecommons.org/licenses/by-nc-sa/4.0/) with extra conditions: use in open source projects related to Vue.js and to illustrate a product's Vue.js integration is allowed. verbatra is an open source project and the mark illustrates its vue-i18n support.",
      "Changed: filled with the brand color (the page's text color in a theme where the brand color lacks contrast) and scaled to fit the stack card chip and the marquee.",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 448 512",
    path: "M356.9 64.3l-76.9 0-56 88.6-48-88.6-176 0 224 383.7 224-383.7-91.1 0zM55.7 96.3l53.8 0 114.5 198.2 114.4-198.2 53.8 0-168.2 288.2-168.3-288.2z",
  },
  deviconSpring: {
    title: "Spring",
    source: "devicon",
    file: "icons/spring/spring-original.svg",
    color: {
      hex: "#6DB33F",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "spring"',
    },
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/spring/spring-original.svg). Drawn in one color and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "M116.452 6.643a59.104 59.104 0 01-6.837 12.136A64.249 64.249 0 0064.205-.026C28.984-.026 0 28.982 0 64.242a64.316 64.316 0 0019.945 46.562l2.368 2.1a64.22 64.22 0 0041.358 15.122c33.487 0 61.637-26.24 64.021-59.683 1.751-16.371-3.051-37.077-11.24-61.7zM29.067 111.17a5.5 5.5 0 01-4.269 2.034c-3.018 0-5.487-2.484-5.487-5.502 0-3.017 2.485-5.501 5.487-5.501 1.25 0 2.485.433 3.452 1.234 2.351 1.9 2.718 5.384.817 7.735zm87.119-19.238c-15.843 21.122-49.68 14.003-71.376 15.02 0 0-3.852.234-7.721.867 0 0 1.45-.617 3.335-1.334 15.226-5.301 22.43-6.335 31.685-11.086 17.427-8.869 34.654-28.274 38.24-48.463-6.637 19.422-26.75 36.11-45.077 42.895-12.557 4.635-35.238 9.136-35.238 9.136l-.917-.484c-15.442-7.518-15.91-40.977 12.157-51.78 12.291-4.735 24.048-2.134 37.323-5.302 14.175-3.367 30.568-14.004 37.238-27.874 7.471 22.19 16.46 56.932.35 78.405z",
  },
  deviconNextjs: {
    title: "Next.js",
    source: "devicon",
    file: "icons/nextjs/nextjs-plain.svg",
    color: {
      hex: "#000000",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "nextdotjs"',
    },
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/nextjs/nextjs-plain.svg). Drawn in one color and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "M64 0A64 64 0 0 0 0 64a64 64 0 0 0 64 64 64 64 0 0 0 35.508-10.838L47.014 49.34v40.238H38.4V38.4h10.768l57.125 73.584A64 64 0 0 0 128 64 64 64 0 0 0 64 0Zm17.777 38.4h8.534v48.776L81.777 75.97Zm24.18 73.92-.111.096a64 64 0 0 0 .111-.096z",
  },
  deviconNuxt: {
    title: "Nuxt",
    source: "devicon",
    file: "icons/nuxt/nuxt-original.svg",
    color: {
      hex: "#00DC82",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "nuxt"',
    },
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/nuxt/nuxt-original.svg). Drawn in one color and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "M71.679 106.667h47.359c1.514 0 2.962-.533 4.268-1.283 1.307-.75 2.66-1.688 3.415-2.986.755-1.298 1.279-2.769 1.279-4.264s-.524-2.971-1.279-4.268l-32-55.038c-.755-1.297-1.68-2.24-2.99-2.991-1.312-.751-3.18-1.279-4.695-1.279-1.514 0-2.957.533-4.263 1.279-1.307.746-2.232 1.693-2.987 2.991l-8.108 14.08-16.213-27.311c-.755-1.297-1.68-2.66-2.986-3.41-1.307-.75-2.755-.854-4.269-.854-1.514 0-2.957.104-4.264.854-1.306.75-2.66 2.113-3.415 3.41L.854 93.864C.099 95.161 0 96.634 0 98.134c0 1.499.099 2.966.854 4.263.754 1.297 2.103 2.24 3.415 2.986 1.311.747 2.754 1.284 4.264 1.284H38.4c11.835 0 20.449-5.31 26.453-15.364l14.505-25.17 7.678-13.226 23.468 40.104H79.359ZM37.97 93.01H17.066l31.147-53.76L64 66.134 53.543 84.361c-3.986 6.523-8.533 8.65-15.572 8.65zm0 0",
  },
  dotnet: {
    title: ".NET",
    source: "dotnet-brand",
    file: "logo/dotnet-logo.svg",
    color: {
      hex: "#512BD4",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "dotnet"',
    },
    license: "Brand permission (dotnet/brand README)",
    attribution: [
      'The .NET logo is copyright of the .NET authors. dotnet/brand README, License section: "use the illustrations and logo to represent .NET in related content, per the .NET Brand Guidelines. The .NET brand guidelines and .NET logo are copyright of the .NET authors." (https://github.com/dotnet/brand/blob/91845f6ddf2123b3bb1bfd1b6a386d9ce02b43aa/README.md).',
      "Changed: the square drawn in one color with the lettering knocked out, filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "evenodd",
    viewBox: "0 0 456 456",
    path: "M0 0H456V456H0ZM81.2738 291.333C78.0496 291.333 75.309 290.259 73.052 288.11C70.795 285.906 69.6665 283.289 69.6665 280.259C69.6665 277.173 70.795 274.529 73.052 272.325C75.309 270.121 78.0496 269.019 81.2738 269.019C84.5518 269.019 87.3193 270.121 89.5763 272.325C91.887 274.529 93.0424 277.173 93.0424 280.259C93.0424 283.289 91.887 285.906 89.5763 288.11C87.3193 290.259 84.5518 291.333 81.2738 291.333ZM210.167 289.515H189.209L133.994 202.406C132.597 200.202 131.441 197.915 130.528 195.546H130.044C130.474 198.081 130.689 203.508 130.689 211.827V289.515H112.149V171H134.477L187.839 256.043C190.096 259.57 191.547 261.994 192.192 263.316H192.514C191.977 260.176 191.708 254.859 191.708 247.365V171H210.167V289.515ZM300.449 289.515H235.561V171H297.87V187.695H254.746V221.249H294.485V237.861H254.746V272.903H300.449V289.515ZM392.667 187.695H359.457V289.515H340.272V187.695H307.143V171H392.667V187.695Z",
  },
  deviconYaml: {
    title: "YAML",
    source: "devicon",
    file: "icons/yaml/yaml-plain.svg",
    color: {
      hex: "#CB171E",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "yaml"',
    },
    license: "MIT",
    attribution: [
      "Copyright (c) 2015 konpa",
      "MIT License: https://github.com/devicons/devicon/blob/v2.18.0/LICENSE (Devicon 2.18.0, icons/yaml/yaml-plain.svg). Drawn in one color and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
    ],
    fillRule: "nonzero",
    viewBox: "0 0 128 128",
    path: "m0.5 5.6289 21.754 34.15v21.646h13.959v-21.646l22.775-34.15h-15.02l-13.947 21.988-13.832-21.988h-15.689zm63.994 0.13086-23.66 55.797h11.189l5.1387-12.408h25.266l4.252 12.408h11.957l-22.699-55.797h-11.443zm5.9922 11.773 7.7441 20.475h-16.387l8.6426-20.475zm16.195 50.139v54.451h40.818v-11.635-0.00195h-28.863v-42.814h-11.955zm-64.428 0.011719v54.687h11.734v-37.723l12.279 25.355h9.2344l12.699-26.246v38.602h11.256v-54.676h-15.369l-13.637 24.732-12.986-24.732h-15.211z",
  },
  simpleAnthropic: {
    title: "Anthropic",
    source: "simple-icons",
    file: "icons/anthropic.svg",
    color: {
      hex: "#191919",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "anthropic"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), Anthropic icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The Anthropic logo is a trademark of Anthropic, PBC; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z",
  },
  simpleGemini: {
    title: "Gemini",
    source: "simple-icons",
    file: "icons/googlegemini.svg",
    color: {
      hex: "#8E75B2",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "googlegemini"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), Gemini icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The Gemini logo is a trademark of Google LLC; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  },
  simpleDeepl: {
    title: "DeepL",
    source: "simple-icons",
    file: "icons/deepl.svg",
    color: {
      hex: "#0F2B46",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "deepl"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), DeepL icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The DeepL logo is a trademark of DeepL SE; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M20.907 4.93953 12.68543.18573a1.3577 1.3577 0 0 0-1.3709 0L3.09298 4.9565a1.3766 1.3766 0 0 0-.68639 1.18233v9.52646a1.3766 1.3766 0 0 0 .68639 1.19363l8.22157 4.75946.06223.03583 4.04856 2.3458-.01131-2.06106.0075-1.1446.0038.01885v-.38467c0-.23006.1188-.43371.29605-.56005l.264-.15086.12633-.06977h-.0075l4.80283-2.7795a1.3803 1.3803 0 0 0 .68639-1.19551V6.13505a1.3803 1.3803 0 0 0-.68642-1.19552m-9.85269 9.68863a1.4275 1.4275 0 0 1-.39976 1.3841 1.4086 1.4086 0 0 1-1.97054 0 1.4199 1.4199 0 0 1 0-2.06294 1.4086 1.4086 0 0 1 2.0422.07543l3.32822-1.91585.6864.38656zm5.77019-2.41367a1.4086 1.4086 0 0 1-1.97054 0 1.4256 1.4256 0 0 1-.3696-1.47837l-.0132.0075-3.7525-2.1723-.05657.05656a1.4086 1.4086 0 0 1-1.97053 0 1.4199 1.4199 0 0 1 0-2.06293 1.4086 1.4086 0 0 1 1.97242 0c.3941.37713.52422.91832.39033 1.40672l3.7808 2.20059.01886-.01886a1.4086 1.4086 0 0 1 1.97242 0 1.42746 1.42746 0 0 1 0 2.06105z",
  },
  simpleGoogleTranslate: {
    title: "Google Translate",
    source: "simple-icons",
    file: "icons/googletranslate.svg",
    color: {
      hex: "#4285F4",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "googletranslate"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), Google Translate icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The Google Translate logo is a trademark of Google LLC; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M22.401 4.818h-9.927L10.927 0H1.599C.72 0 .002.719.002 1.599v16.275c0 .878.72 1.597 1.597 1.597h10L13.072 24H22.4c.878 0 1.597-.707 1.597-1.572V6.39c0-.865-.72-1.572-1.597-1.572zm-15.66 8.68c-2.07 0-3.75-1.68-3.75-3.75 0-2.07 1.68-3.75 3.75-3.75 1.012 0 1.86.375 2.512.976l-.99.952a2.194 2.194 0 0 0-1.522-.584c-1.305 0-2.363 1.08-2.363 2.409S5.436 12.16 6.74 12.16c1.507 0 2.13-1.08 2.19-1.808l-2.188-.002V9.066h3.51c.05.23.09.457.09.764 0 2.147-1.434 3.669-3.602 3.669zm16.757 8.93c0 .59-.492 1.072-1.097 1.072h-8.875l3.649-4.03h.005l-.74-2.302.006-.005s.568-.488 1.277-1.24c.712.771 1.63 1.699 2.818 2.805l.771-.772c-1.272-1.154-2.204-2.07-2.89-2.805.919-1.087 1.852-2.455 2.049-3.707h2.034v.002h.002v-.94h-4.532v-1.52h-1.471v1.52H14.3l-1.672-5.21.006.022h9.767c.605 0 1.097.48 1.097 1.072v16.038zm-6.484-7.311c-.536.548-.943.873-.943.873l-.008.004-1.46-4.548h4.764c-.307 1.084-.988 2.108-1.651 2.904-1.176-1.392-1.18-1.844-1.18-1.844h-1.222s.05.678 1.7 2.61z",
  },
  simpleOpencode: {
    title: "OpenCode",
    source: "simple-icons",
    file: "icons/opencode.svg",
    color: {
      hex: "#000000",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "opencode"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), OpenCode icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The OpenCode logo is a trademark of the OpenCode project; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M22 24H2V0h20zM17 4.8H7v14.4h10z",
  },
  simpleLibretranslate: {
    title: "LibreTranslate",
    source: "simple-icons",
    file: "icons/libretranslate.svg",
    color: {
      hex: "#1565C0",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "libretranslate"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), LibreTranslate icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The LibreTranslate logo is a trademark of the LibreTranslate project; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M13.7835 0q-1.7162 4.666-8.892 7.991l1.3623 1.523q5.3951-2.6385 7.8192-5.996 2.4777 3.1857 8.1948 6.1247L23.544 8.066q-6.103-2.9283-8.4198-6.2425.118-.1824.4827-1.255ZM9.5467 7.991q-.3218 3.5075-1.4481 5.8028-1.1155 2.2953-3.6683 4.5692l1.4265 1.2763q2.8426-2.6064 4.1941-5.556 1.1799 1.0297 2.4133 2.6494l1.4588-1.3086q-1.1477-1.4587-3.2286-3.25.547-2.0271.7614-3.9793zm7.1007 0q-.1716 4.151-1.4158 6.3927-1.2444 2.2417-3.7328 3.8934l1.4051 1.298q3.5718-2.6065 4.7088-5.8242 1.7268 3.4644 4.8696 5.867l1.4051-1.3408q-1.7806-1.3192-3.0141-2.7887-1.2227-1.4801-1.8662-3.0461-.6328-1.5767-.6328-2.1452l.075-.751q.0859-.8366.0859-1.3942zM.1126 8.8018V24h9.4443v-1.7095H2.0515V8.8018Z",
  },
  simpleI18next: {
    title: "i18next",
    source: "simple-icons",
    file: "icons/i18next.svg",
    color: {
      hex: "#26A69A",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "i18next"',
    },
    license: "CC0-1.0",
    attribution: [
      "Simple Icons 16.35.0 (https://simpleicons.org), i18next icon, published under CC0 1.0 (https://github.com/simple-icons/simple-icons/blob/16.35.0/LICENSE.md). The i18next logo is a trademark of the i18next project; the brand's own terms are separate from that data license, and the logo is shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M14.93646 2.48699v4.51684l5.0758 13.03647s1.5495 3.1839-2.8824 3.9597H7.01922s-4.13084-.4311-3.14053-3.7019L9.21276 7.00401V2.48699h5.7237Zm2.0894 13.10781c-4.4301-1.3742-8.15457-.6365-9.97498-.0788l-1.83572 4.4186c-.78296 2.499 2.27302 2.9417 2.59687 2.9813l.02755.0032h8.44448c3.5407-.5982 2.511-2.972 2.4147-3.1773l-.0068-.0142-1.6661-4.1328Zm-7.81345.7772c.78905.0004 1.42905.3862 1.42905.8646 0 .4764-.6404.864-1.42905.864-.7887 0-1.42711-.3878-1.42711-.864 0-.4784.6384-.8646 1.4271-.8646Zm5.08375 0c.7871.0004 1.4271.3862 1.4271.8646 0 .4764-.6403.864-1.4271.864-.791 0-1.429-.3878-1.429-.864 0-.4784.638-.8646 1.429-.8646Zm-4.5001-5.2131c-.55227 0-.99993.5395-.99993 1.2051 0 .6656.44766 1.2051.99993 1.2051.5522 0 .9998-.5395.9998-1.2051 0-.6656-.4476-1.2051-.9998-1.2051Zm3.6413-1.29686c-.6549 0-1.1862.63806-1.1862 1.42906 0 .7871.5313 1.4271 1.1862 1.4271.653 0 1.1862-.64 1.1862-1.4271 0-.7907-.5328-1.42906-1.1862-1.42906Zm6.0363-2.73783s-2.1219 1.54591-4.0858-.41975V4.55615s2.7243-.60065 4.0858 2.56806Zm-14.84367 0C5.9908 3.9555 8.71543 4.55615 8.71543 4.55615v2.14831c-1.96566 1.96566-4.08544.41975-4.08544.41975ZM15.04366 0c.4954 0 .8958.4387.8958.98109 0 .54203-.4006.98074-.8958.98074H8.95478c-.49315 0-.89428-.43871-.89428-.98074C8.0605.43871 8.46146 0 8.95478 0h6.08888Z",
  },
  simpleGnu: {
    title: "GNU",
    source: "simple-icons",
    file: "icons/gnu.svg",
    color: {
      hex: "#A42E2B",
      source: 'Simple Icons 16.35.0 data/simple-icons.json, entry "gnu"',
    },
    license: "CC-BY-SA-2.0",
    attribution: [
      "GNU logo by Aurelio A. Heckert (https://www.gnu.org/graphics/heckert_gnu.html), licensed under CC BY-SA 2.0 (https://creativecommons.org/licenses/by-sa/2.0/). Simple Icons 16.35.0 records this license for its gnu icon in data/simple-icons.json.",
      "Changed: redrawn in one color by Simple Icons and filled with the brand color (the page's text color in a theme where the brand color lacks contrast).",
      "Share-alike: this redrawn mark stays under CC BY-SA 2.0; the surrounding site and its code are not derivative works of it. The GNU name and logo are marks of the Free Software Foundation, shown only to identify compatibility.",
    ],
    fillRule: "nonzero",
    path: "M5.072 13.931a.62.62 0 00-.52.338c-.114.211-.388.242-.516.201-.21-.07-.48-.119-.744.068-.263.187-.546.045-.495-.297.05-.34.172-.645.5-.83.713-.41.216-.695.607-1.108.394-.412.307-.537.293-1.1-1.326-.2-2.077-.58-2.915-1.63C.442 8.528.117 7.664.03 6.35-.057 5.033.02 4.18.588 3.09 1.156 2 1.756 1.475 2.788.93 3.825.383 4.84.254 5.78.271c.938.014 1.563.082 2.093.386.53.303 1.016.684 1.324.685.24.015.477-.053.673-.192.04 1.02-.878 1.108-1.698 1.13-.82.02-1.324-.317-2.08-.192-.754.128-1.992.47-2.595 1.52-.603 1.05-.624 1.42-.573 2.3.05.879.806 1.535 1.234 1.543.428.007.523-.117.898-.36.374-.246 2.284-2.61 2.934-3.14.653-.53 1.296-.696 1.99-.705.695-.008.87.015 1.433.246.56.229.903.652 1.355.91.23-.135.375-.34.584-.495.76-.552 1.152-.702 2.053-.615.518.052 1.17.347 1.56.686.693.604 1.265 1.44 1.727 2.079.36.497.785 1.09 1.392 1.277.66.2 1.157-.652 1.23-1.13.043-.27.097-.505.097-.8 0-.297-.03-.655-.115-.965a3.453 3.453 0 00-.392-.87c-.258-.415-.68-.85-1.116-1.071-.246-.125-.826-.353-1.19-.36-.449-.01-.79.14-1.202.168-.5.034-1.396.146-1.786-.24-.25-.246-.283-.41-.324-.73a.76.76 0 00.4.162c.314.026.606-.23.86-.378.21-.123.504-.34.778-.45.704-.285 1.567-.278 2.31-.2.594.06 1.367.324 1.89.62.525.297 1.03.798 1.4 1.269.465.594.72 1.104.888 1.844.216.945.277 2.365.015 3.299-.205.734-.887 1.86-1.467 2.414-.573.547-1.235.81-1.986.955.03.149.033.29.071.416.056.178.163.375.38.313.086-.025.133-.047.246.053.115.1.056.484-.266.66-.164.085-.334.103-.595.11a5.61 5.61 0 01-.953-.046c-.283-.047-.45-.272-.765-.308-.484-.055-.854-.404-1.244-.653-.162-.104-.218-.104-.31-.158.05.154.117.314.15.465.034.145.02.284.037.403.02.12.052.21.07.308.077.068.103.173.233.207.13.035.334-.018.468-.037.135-.018.224-.09.327-.07.105.02.204.096.292.166s.164.08.234.254c.07.178.135.537.146.777.01.24-.018.455-.089.648-.07.19-.135.273-.327.463s-.505.465-.818.66c.058.084.083.162.173.254.09.094.277.197.36.295.083.098.126.168.126.277a.587.587 0 01-.092.373c-.223.3-.483.352-.803.492.054.334.098.572.02.906-.03.137-.102.445-.27.525-.17.08-.492.041-.698.074-.205.031-.32.063-.48.094-.097.141-.24.297-.29.422-.05.127-.034.172.006.3.042.128.185.315.225.468a.93.93 0 01.01.463.834.834 0 01-.23.396c-.128.135-.38.24-.508.346-.125.11-.252.123-.217.303.047.248.41.646.67.744a.793.793 0 00.557-.04c-.014.208-.195.353-.315.493.322-.094.636-.27.854-.504-.067.203-.3.529-.645.816-.345.287-.343.229-.517.344.314.06.606.045.85.002a1.69 1.69 0 01-.64.207 1.876 1.876 0 01-.73-.055c-.26-.063-.499-.301-.814-.465.03.119.053.26.185.38.136.12.335.183.55.284-.273-.03-.559-.037-.825-.096a2.083 2.083 0 01-.478-.164c-.144-.07-.255-.176-.384-.264.06.117.08.256.184.352.104.098.275.135.412.199-.143-.004-.28.029-.43-.01a1.166 1.166 0 01-.443-.21 3.165 3.165 0 01-.445-.395c-.132-.145-.296-.332-.345-.463-.048-.133.03-.225.044-.338-.09.06-.2.094-.272.18-.07.088-.131.166-.1.318.03.15.171.338.27.506-.295-.242-.46-.336-.53-.625-.064-.273.104-.52.233-.725.064-.104.161-.2.22-.3-.134-.128-.284-.24-.4-.388-.112-.15-.161-.352-.276-.492-.117-.143-.274-.232-.41-.348.119.256.317.572.359.77.044.2-.048.323-.12.43-.07.108-.183.134-.291.198-.11.068-.277.016-.342.113s-.083.246-.021.344l.256.398a1.173 1.173 0 01-.327-.28c-.074-.097-.186-.189-.2-.317-.015-.13-.022-.246.064-.363.084-.117.318-.156.422-.246.105-.09.162-.148.156-.264-.006-.117-.12-.2-.217-.273-.3-.225-.68-.43-.934-.699a.931.931 0 01-.24-.379c-.03-.105.002-.188.072-.314.072-.13.315-.305.346-.443.029-.14-.095-.172-.205-.22-.111-.05-.322.024-.425-.062-.103-.086.03-.266-.086-.365-.116-.099-.38-.045-.52-.15a.724.724 0 01-.24-.395.828.828 0 01-.02-.436c.032-.113.128-.133.187-.19.06-.058.108-.105.03-.192-.074-.088-.33.004-.476-.105-.15-.113-.06-.38-.163-.494-.104-.109-.287-.066-.386-.104-.097-.035-.135.09-.194-.109-.06-.199-.063-.797-.143-1.02-.08-.223-.238-.016-.31-.236-.076-.22-.005-.574-.038-.908l-.15-.91c-.52.352-.867.463-1.428.561-.047 1.373-.176 2.182.29 3.705.466 1.521 1.409 2.42 2.68 3.707-1.68-1.256-2.478-2.279-2.98-3.588-.501-1.31-.406-2.407-.356-3.666zm8.918-.553a.837.837 0 01.376.098c.09.061.188.107.27.19.206.21.36.462.428.751.044.186.05.422.064.64-.062-.2-.103-.409-.192-.589-.14-.285-.376-.56-.672-.688a.35.35 0 00-.214-.027c.023.041.063.076.065.133 0 .06-.012.174-.112.223-.16.078-.34.021-.464-.086a.414.414 0 01-.102-.459c.08-.194.375-.194.553-.186zm-1.62-.272c.016-.332.134-.609.432-.77.187-.107.392-.18.604-.215.207-.026.713-.008 1.018.13.232.105.39.271.597.394.205.121.35.201.546.338.3.211.475.44.682.576.1.066.24.057.374.098-.104.03-.24.064-.35.03a1.565 1.565 0 01-.438-.265 2.946 2.946 0 00-.497-.359c-.124-.072-.33-.158-.466-.246-.135-.09-.37-.283-.502-.349a1.618 1.618 0 00-.65-.125c-.256.008-.626.05-.822.228-.197.18-.27.336-.227.566.073-.084.123-.19.195-.254.154-.133.33-.139.52-.113.216.027.323.15.394.354-.047-.033-.135-.109-.204-.135a.495.495 0 00-.438.043c-.18.098-.13.24-.154.396-.013.076-.04.133-.06.2a.39.39 0 01-.18-.099c0 .076-.01.141.005.223.014.084.055.184.084.273-.126-.125-.256-.24-.335-.402a1.058 1.058 0 01-.13-.517zm.218-2.4c.09-.134.12-.343.174-.515-.02.217.02.453-.083.609-.105.158-.292.129-.443.176.118-.09.258-.131.352-.268zm-2.206 3.203c.119-.096.438-.02.676-.002l-.514.133c-.017.06-.01.123-.048.174-.04.051-.114.068-.171.104.006-.155-.062-.313.057-.409zm1.682-6.65c.143.075.32.178.45.18.123.004.157-.08.231-.131.115.38.25.797.448 1.142.083.146.136.079.2.224.063.145.09.439.15.626s.137.32.207.483c-.174-.25-.4-.566-.5-.773-.098-.207-.035-.225-.115-.421-.078-.198-.238-.504-.357-.756-.086.01-.19.026-.255.006-.065-.021-.054-.091-.112-.134-.06-.045-.158-.027-.24-.1-.08-.07-.1-.217-.107-.346zm-.766 1.875c.135-.012.299.023.425.017.126-.006.216-.04.324-.06-.02-.19-.002-.537-.175-.664-.115-.08-.578-.02-.701.006-.28.06-.604.227-.873.33.258-.18.48-.346.79-.44.189-.054.622-.128.814-.075.089.023.104.06.158.135.183.255.183.475.23.773.046.07.095.119.134.194a.91.91 0 01.068.289c-.048-.07-.018-.155-.15-.206-.134-.053-.335-.005-.515.014.13.096.195.186.2.384.007.233-.19.4-.397.417-.285.022-.434-.041-.55-.285-.05-.107-.015-.236-.017-.341-.346.024-.34.013-.592.222.139.2.224.315.45.436.126.066.27.133.426.16.157.027.415.053.58.027a.629.629 0 00.38-.187c.122-.112.134-.274.181-.403a1.2 1.2 0 01-.07.37c-.14.27-.38.353-.667.353-.275 0-.616-.063-.873-.17-.205-.084-.545-.324-.625-.533-.056-.143-.012-.318-.018-.477.285-.19.354-.143.689-.198.14-.025.239-.076.374-.088zm-1.655-1.28c.007-.113.02-.11.03-.166-.26-.07-.36.099-.514.41-.057.116 0 .187-.062.264-.06.076-.16.065-.257.139-.098.074-.196.215-.29.292-.188.156-.446.25-.666.358.15-.111.443-.28.538-.44.05-.085.042-.246.12-.324.078-.075.105-.13.205-.15.1-.018.06-.135.093-.228.032-.091.097-.158.165-.251s.156-.23.29-.282c.136-.05.348.005.45-.023.103-.03.044-.105.119-.15s.219-.023.32-.072c.176-.084.26-.227.367-.377.015.326.01.56-.107.869-.131.346-.266.55-.641.763-.128.072-.257.098-.365.137.062-.086.152-.123.188-.256.034-.136.009-.4.017-.512zM15.7 9.447c-.177.014-.22-.012-.363.09l.232.36c-.006-.236.018-.284.133-.45zm-.465-.172c.246-.104.46-.19.73-.207.107-.008.274.009.383.016.094-.137.21-.244.256-.4.028-.104.015-.584-.038-.71-.146-.36-.29-.376-.495-.584-.146-.15-.152-.38-.197-.638-.015-.094-.062-.213-.084-.31a3.9 3.9 0 00-.857-.045c.148-.143.29-.271.334-.486a.959.959 0 00-.113-.667c-.12-.191-.315-.36-.494-.517-.178-.155-.436-.284-.604-.412.22-.077.444-.194.66-.235.56-.108 1.043.057 1.584.384.315.19.573.37.902.716.33.344.735.975 1.053 1.348.317.375.575.67.853.893.276.226.528.289.792.43l.412.439.335-.413.535.06.111-.601.49-.136-.079-.811.354-.252-.267-.504.27-.553-.352-.63.135-.607-.407-.348-.053-.646-.569-.217-.227-.56-.64-.008-.315-.417-.43.03-.48-.053-.27-.2-.395.26-.477-.247-.947.36.618-.538.64-.102.49-.126.662.218.582-.147.563.33.596-.03.293.525.591.067.32.58.372.206.1.746.333.315-.148.653.39.494-.363.529.39.332-.499.443.506.529-.613.2.398.566-.5.088.327.622-.563-.008.285.466-.62-.074.147.672-.468-.411-.159.814-.322-.585-.175.73-.397-.537.011.765-.439-.688c.091.39.073.817.33 1.185.793-.107 1.311-.307 1.92-.892.552-.533 1.214-1.644 1.394-2.35.204-.802.21-2.281.01-3.101-.195-.787-.447-1.163-.897-1.807-.43-.455-.853-.94-1.399-1.264-.8-.48-1.828-.608-2.74-.596a3.22 3.22 0 00-1.147.215c-.527.19-.95.61-1.487.818-.175.067-.315.068-.454-.004.135.27.28.39.62.49.243.07.824.025 1.226-.012.43-.04.654-.167 1.238-.16.57.01 1.024.225 1.272.368.511.292.877.614 1.196 1.13.175.28.298.6.383.924.086.324.124.688.13 1.006.006.318-.019.602-.097.888-.182.669-.583 1.35-1.407 1.245-.504-.063-1.263-1.01-1.518-1.357-.514-.701-1.042-1.477-1.687-2.06a2.587 2.587 0 00-1.463-.65c-.992-.09-1.287.099-2.033.716.15.047.3.074.455.145.346.156.662.357.938.615.29.27.42.442.43.829.007.259-.204.465-.4.649-.117.114-.274.218-.37.307-.128.117-.286.246-.125.432.06.07.165.123.252.189.14.103.075.488-.108.592a.61.61 0 01-.713-.061c.246-.035.402-.068.395-.27-.002-.115-.15-.213-.297-.28-.35-.16-.614-.134-.963-.386-.353-.254-.36-.393-.455-.79-.17.017-.327.02-.554.097-.226.074-.478.254-.684.299-.52.11-.623.078-.907.006-.501-.132-1.15.09-1.8.299-.107.033-.543 0-.836.102a5.518 5.518 0 00-1.457.853c-.556.469-1.286 1.869-1.698 3.477-.045.49.095.817-.213 1.055-.308.24-.3.851-.405 1.023-.103.17-.225.094-.45.336-.223.24-.337.201-.332.654.195-.125.477-.273.725-.285.22-.006.222.283.785-.273.3-.299.88-.309 1.283-.439.402-.13 1.125-.402 1.85-1.21.725-.81 1.072-1.664 1.213-2.896.02.215.06.463-.033 1.065-.095.604-.296 1.28.13 2.092l.264.504c-.157-.215-.465-.566-.56-.815l-.21-.577c-.48.752-.59.885-1.256 1.423-.026.334-.033.682.076 1.002.108.32-.064.688.02.9.082.21.273.09.336.303s-.032.635.064.842c.1.207.337.082.453.15.115.066.154.158.215.246.063.088-.023.297.103.365.126.066.32.01.453.074.13.066.15.223.12.361-.033.141-.173.205-.234.348a.365.365 0 00.02.373c.074.131.236.201.4.27.162.064.39.027.559.12.169.09.32.272.408.405a.542.542 0 01.109.363 1.038 1.038 0 01-.137.434c-.074.135-.236.3.02.555.254.254.246.145.393.313-.017-.289-.135-.52-.05-.738.089-.217.35-.256.485-.352.139-.1.219-.232.326-.348 0 .148.015.31-.002.42-.033.227-.102.432.237.467.153.016.299-.082.458-.14-.084.147-.23.27-.252.45a.793.793 0 00.13.56c.123.18.34.312.498.415.158.105.244.115.365.174.006.176-.03.363-.01.53a.962.962 0 00.17.454c.098.14.252.22.398.32-.08-.188-.242-.365-.24-.56.002-.197.06-.335.252-.51.19-.175.64-.325.85-.495a1.03 1.03 0 00.355-.436c.075-.164.055-.43.07-.576.068.205.078.27.102.486.02.217-.127.521-.19.68a1.02 1.02 0 00.51-.525c.058.035.03.125.05.301.094-.092.2-.162.293-.25.094-.088.195-.164.243-.287.046-.12.027-.252-.007-.393-.035-.143-.193-.307-.28-.463-.083-.152.017-.305.01-.492-.17-.029-.313-.117-.51-.088-.196.03-.42.248-.622.252-.2 0-.314-.188-.478-.238-.165-.053-.33-.045-.495-.07.21-.199 1.02-.295 1.576-.385a9.794 9.794 0 011.47-.133c.22-.006.506.068.66.025.153-.045.12-.15.165-.264.13-.318.066-.604-.004-.924-.444-.053-.908-.115-1.356-.082-.438.033-.956.242-1.41.256-.39.014-.975-.074-1.31-.28-.414-.25-.732-.79-.846-.966-.184-.28-.415-.836-.56-1.088-.14-.254-.171-.324-.29-.43-.116-.105-.276-.113-.417-.17.16.014.336-.035.482.047.22.127.465.648.601.877.145-.486.11-.676.53-.95-.337.378-.347.665-.429 1.11.28.46.67 1.193 1.18 1.396.186.074.502.12.7.145.622.076 1.22-.119 1.83-.27.444-.11.896-.066 1.437-.035.183.012.616-.1.707-.283a.33.33 0 00-.024-.33c-.07-.105-.255-.158-.355-.254-.1-.098-.156-.21-.235-.314a6.51 6.51 0 01-1.062.115c.22-.09.433-.14.66-.23.237-.098.463-.219.676-.359.186-.123.303-.193.438-.334.133-.143.304-.289.403-.463.1-.174.114-.369.12-.584.004-.215-.005-.516-.088-.69-.084-.173-.243-.226-.37-.265-.128-.04-.217.063-.35.076-.134.014-.258.096-.452.006a1.68 1.68 0 01-.617-.548c-.196-.274-.335-.722-.534-1.067-.343-.596-.77-1.15-1.18-1.702a3.392 3.392 0 01-.1-.508c-.032-.322-.036-.656.064-.97.075-.24.188-.493.438-.591a.48.48 0 01.317-.022c.09.032.18.135.142.252-.04.129-.127.134-.188.198a.693.693 0 00-.183.33c.11-.004.262-.011.354.013.12.03.23.11.29.279-.142-.126-.212-.185-.39-.188-.082-.002-.18.026-.27.04-.034.109-.054.244-.1.33-.05.084-.142.063-.177.16a.992.992 0 00-.02.392h.004zm1.242-.15c.056.022.075.028.146.08.07.053.165.105.22.23a.878.878 0 01.04.4c-.048-.015-.113-.005-.163-.047-.05-.043-.08-.14-.143-.18-.065-.043-.117-.034-.188-.043.038.096.05.199.036.3-.036.204-.156.308-.352.33-.084.013-.22-.015-.292-.028.034.075.09.143.126.219.164-.023.285-.02.375-.061.088-.041.183-.135.296-.173.113-.04.214-.04.338-.06-.098.085-.162.168-.26.254l.215.623c.152.096.294.146.485.263.19.116.42.327.67.44.248.112.395.176.656.224.26.05.467.262.722.295.255.032.735.041.932.021.225-.02.516-.135.542-.38-.188.044-.475.004-.619-.35-.064-.156-.034-.446-.132-.63-.099-.187-.236-.246-.4-.475-.164-.23-.43-.59-.58-.895-.15-.308-.188-.654-.313-.93-.128-.273-.319-.494-.469-.707-.323-.463-.584-.777-1.12-1.011-.257-.112-.55-.143-.823-.213-.113.05-.268.104-.295.237a.536.536 0 00.12.42c.16.166.395.343.487.604.06.168.076.73.025.883-.054.16-.178.257-.282.36zm.052 1.332c-.05.043-.087.087-.167.122-.08.036-.19.045-.295.07.148.232.305.467.447.71.143.242.266.51.4.764-.006-.147.003-.301-.018-.437-.02-.136-.083-.254-.145-.461-.06-.206-.135-.484-.222-.768zm-4-5.087a3.32 3.32 0 00.065.806c.058.267.11.404.328.564.396.295.648.245.955.416.145.08.328.217.382.359.053.146-.036.3-.146.363.192.029.408-.19.318-.41-.045-.11-.255-.16-.32-.271a.41.41 0 01-.033-.335c.053-.202.454-.388.597-.546.218-.248.3-.453.177-.77-.172-.445-.842-.804-1.242-.98-.183-.08-.287-.083-.43-.128.293.174.602.31.75.69.124.32.016.444.022.72.002.13.172.197.248.277.064.072.06.125.008.223a.256.256 0 00-.11-.2c-.113-.08-.235-.062-.295-.224-.09-.248.09-.484-.112-.762-.15-.208-.353-.441-.625-.447a1.073 1.073 0 00-.36.058l-.183-.22-.005-.003c-.372-.34-.626-.62-1.146-.852-.522-.234-.78-.27-1.38-.256-.596.013-1.19.063-1.882.66-.694.6-2.48 2.888-2.915 3.177-.43.289-.527.389-1.068.389-.54 0-1.387-.766-1.42-1.723-.032-.956-.045-1.297.62-2.45.665-1.151 1.867-1.504 2.762-1.624.895-.12 1.432.194 2.092.195.66.002 1.314-.11 1.508-.637-.095.056-.221.12-.577.1-.355-.018-.85-.43-1.402-.705C7.157.548 6.54.515 5.75.501c-.79-.015-1.777.045-2.755.574C2.018 1.6 1.35 2.16.783 3.195.215 4.228.13 5.07.223 6.322.313 7.57.7 8.5 1.442 9.42c.744.914 1.485 1.363 2.823 1.529l.283-1.242-.504.72.014-.802-.455.565-.202-.767-.367.615-.183-.855-.535.432.17-.705-.707.078.324-.491-.644.006.375-.653-.57-.091.454-.596-.698-.206.578-.555-.573-.467.448-.348-.42-.56.448-.52-.167-.684.379-.33.113-.785.426-.214.365-.61.677-.073.334-.553.68.035.642-.348.666.154.756-.228.562.13.73.108.706.564-1.08-.377-.545.26-.45-.273-.31.21-.55.056-.492-.03-.358.436-.732.007-.26.59-.65.227-.06.678-.468.366.155.637-.401.664.31.58-.305.53.403.264-.09.853.563.14.125.634.613-.063.38.434.47-.461c.859-.428 1.213-.668 1.883-1.391.76-.823 1.196-1.584 2.208-2.147.73-.405 1.32-.551 2.139-.408.766.132 1.024.593 1.59 1.077.06-.11.07-.14.168-.218-.03.142-.08.287-.093.423z",
  },
} as const satisfies Readonly<Record<string, BrandMark>>;

export type BrandMarkId = keyof typeof BRAND_MARKS;

export const BRAND_MARK_IDS = Object.keys(BRAND_MARKS) as ReadonlyArray<BrandMarkId>;

export function brandMarkSourceUrl(mark: BrandMark): string {
  return `${BRAND_MARK_SOURCES[mark.source].fileBase}${mark.file}`;
}
