import { Geist, Geist_Mono } from "next/font/google";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const FONT_VARIABLES = `${sans.variable} ${mono.variable}`;
