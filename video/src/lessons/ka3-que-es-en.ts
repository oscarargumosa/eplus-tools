import type { LessonData } from "../types";

// ════════════════════════════════════════════════════════════════
// EN — What is Key Action 3? · European Youth Together
// English version of ka3-que-es.ts. Same structure/themes/images;
// on-screen text + narration translated. TTS: ElevenLabs multilingual_v2.
// ════════════════════════════════════════════════════════════════

export const ka3QueEsEnLesson: LessonData = {
  id: "ka3-que-es-en-001",
  title: "European Youth Together — Key Action 3",
  category: "Erasmus+ · KA3",
  slides: [
    // ── 0 · HOOK ─────────────────────────────────────────────
    {
      type: "intro",
      variant: "dark",
      title: "European Youth\nTogether",
      subtitle: "Up to €500,000 for youth-led projects",
      tag: "Erasmus+ · Key Action 3",
      theme: "youth",
      narration:
        "Did you know there is a European programme that funds youth-led projects with up to half a million euros, and that almost nobody knows about? It is called European Youth Together, and it is part of Key Action 3 of Erasmus Plus.",
    },

    // ── 1 · THE BIG NUMBER ───────────────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "youth",
      text: "Half a million euros for young people to organise, propose and improve their society.",
      source: "It is closer to you than you think",
      narration:
        "Half a million euros for young people to organise, propose and improve the society they live in. It sounds far away, I know. But today I want to show you that it is much closer to you than you think.",
    },

    // ── 2 · THE THREE KEY ACTIONS ────────────────────────────
    {
      type: "diagram",
      variant: "dark",
      title: "Erasmus+ has three Key Actions",
      theme: "europe",
      steps: [
        { label: "KA1", description: "Mobility — moves people" },
        { label: "KA2", description: "Cooperation — connects organisations" },
        { label: "KA3", description: "Policy — gives people a voice" },
      ],
      narration:
        "To understand it well, let us start at the beginning. Erasmus Plus is organised into three Key Actions, and each one pursues something different.",
    },

    // ── 3 · KA1 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Key Action 1\nMobility",
      text: "It funds students, teachers or young people to travel to another country to learn or train.",
      theme: "travel",
      imagePosition: "right",
      bullets: ["Its protagonist is the PERSON"],
      narration:
        "Key Action 1 is mobility: it funds students, teachers or young people to travel to another country to learn or train. Its protagonist is the person.",
    },

    // ── 4 · KA2 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "light",
      title: "Key Action 2\nCooperation",
      text: "Organisations from several countries partner up to create something together and develop new methods.",
      theme: "collaboration",
      imagePosition: "left",
      bullets: ["Its protagonist is the ORGANISATION"],
      narration:
        "Key Action 2 is cooperation: it funds organisations from several countries to partner up, create something together, exchange good practices or develop new methods. Its protagonist is the organisation.",
    },

    // ── 5 · KA3 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Key Action 3\nPolicy support",
      text: "We usually picture offices, laws and institutions. But what Europe truly wants is closer to you.",
      theme: "politics",
      imagePosition: "right",
      bullets: ["Its protagonist is YOU"],
      narration:
        "Key Action 3 is policy support. And here we usually imagine something huge and distant: offices, laws, institutions. But let me tell you what Europe is really after with this action, because it is much closer to you than it seems.",
    },

    // ── 6 · ONE LINE TO REMEMBER ─────────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "youth",
      title: "One line to remember",
      bullets: [
        "KA1 moves people",
        "KA2 connects organisations",
        "KA3 gives people a voice",
        "...in the decisions that affect them",
      ],
      narration:
        "If you want one line to remember it: Key Action 1 moves people, Key Action 2 connects organisations, and Key Action 3 gives people a voice in the decisions that affect them.",
    },

    // ── 7 · A VOICE TO WHOM? TO YOU ──────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "support",
      text: "A voice to whom? To you. To young people.",
      source: "The heart of Key Action 3",
      narration:
        "A voice to whom? To you. To young people. The heart of Key Action 3 is that people, and especially young people, get closer to how the decisions that affect their lives are made.",
    },

    // ── 8 · WHAT THEY CAN DO ─────────────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "youth",
      title: "So that young people can...",
      bullets: [
        "Be heard",
        "Think together",
        "Make proposals",
        "Improve their society, from local to European",
      ],
      narration:
        "That they are heard. That they can think together, make proposals and improve the society they live in, starting in their neighbourhood or town and reaching, if needed, all the way to Europe.",
    },

    // ── 9 · DECISIONS THAT MATTER ────────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "education",
      title: "Decisions that shouldn't be made without you",
      bullets: [
        "Education",
        "Youth employment",
        "The environment",
        "How we take part in democracy",
      ],
      narration:
        "Because decisions about education, about youth employment, about the environment or about how we take part in democracy should not be made without the people they affect. Key Action 3 exists, in large part, to close that gap: so that you and your ideas reach those who decide.",
    },

    // ── 10 · EUROPEAN YOUTH TOGETHER ─────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "European Youth Together",
      text: "Managed by the EACEA, the European Education and Culture Executive Agency.",
      theme: "youth",
      imagePosition: "left",
      bullets: [
        "Youth organisations from several countries",
        "Young people at the centre",
      ],
      narration:
        "And how does that turn into something you can actually apply for? Key Action 3 opens a door with its own name: European Youth Together, managed by the EACEA, the European Education and Culture Executive Agency.",
    },

    // ── 11 · THE NUMBERS ─────────────────────────────────────
    {
      type: "stats",
      variant: "dark",
      theme: "europe",
      title: "What we are talking about",
      stats: [
        { value: 500, suffix: " K€", label: "Up to this much per project" },
        { value: 3, suffix: "+ countries", label: "Allied youth organisations" },
        { value: 100, suffix: "%", label: "Led by young people" },
      ],
      narration:
        "It is an action designed for youth organisations from several countries to work together and put young people at the centre. And yes: we are talking about projects that can reach five hundred thousand euros of European funding.",
    },

    // ── 12 · EXAMPLE 1 · MENTAL HEALTH ───────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Example 1\nMental health",
      text: "Youth associations from five countries listen to hundreds of young people and take their proposals to decision-makers.",
      theme: "support",
      imagePosition: "right",
      bullets: [
        "5 countries united",
        "Hundreds of young people heard",
        "Proposals to local and European forums",
      ],
      narration:
        "Let me give you a couple of examples so you see it clearly. Imagine a group of youth associations from five countries that spot the same problem: teenagers' mental health. They join forces, listen to hundreds of young people, gather their proposals and take them to the table of policy-makers in their cities, and also to European forums. It is not a study done to young people from the outside: it is built by the young people themselves.",
    },

    // ── 13 · EXAMPLE 2 · RURAL AREAS ─────────────────────────
    {
      type: "split",
      variant: "light",
      title: "Example 2\nRural areas",
      text: "Young people from rural areas, who often feel forgotten, design proposals together to improve their opportunities.",
      theme: "rural",
      imagePosition: "left",
      bullets: [
        "They connect different countries",
        "They improve opportunities in their region",
        "Their voice counts in local and regional decisions",
      ],
      narration:
        "Or picture another one: boys and girls from rural areas in different countries, who often feel forgotten, who connect to design proposals together on how to improve opportunities in their regions, and they get their voice to count in local and regional decisions.",
    },

    // ── 14 · KA3 IN PRACTICE ─────────────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "youth",
      text: "Young people who stop being spectators and start proposing, being heard, having influence.",
      source: "With real resources behind them",
      narration:
        "That is Key Action 3 in practice: young people who stop being spectators and start proposing, being heard, having influence. With real resources behind them.",
    },

    // ── 15 · KEEP THIS IDEA ──────────────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "youth",
      title: "Keep this idea",
      bullets: [
        "It is not about distant offices",
        "It is about thinking together and proposing",
        "From local to European",
        "Better funded than you imagine",
      ],
      narration:
        "Keep this idea. Key Action 3 is not about distant offices. It is about young people thinking together, proposing and improving their society, from local to European. If you have ever thought, I wish we could change this, this is probably your action. And it may be better funded than you imagine.",
    },

    // ── 16 · OUTRO · CTA ─────────────────────────────────────
    {
      type: "outro",
      variant: "dark",
      title: "Come and meet us",
      subtitle: "All the opportunities Europe puts on the table, for you",
      cta: "eufundingschool.com",
      narration:
        "And before we close, an invitation. This is just one of the many opportunities Europe puts on the table. If you want to know all the ones out there for you, for your company, for your association or for you as a citizen, the best advice I can give you is simple: come and meet us. We are waiting for you at EU Funding School dot com.",
    },
  ],
};
