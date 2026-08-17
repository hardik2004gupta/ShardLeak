import Navbar from '@/components/layout/Navbar';
import Hero from '@/components/landing/Hero';
import ProblemSection from '@/components/landing/ProblemSection';
import HowItWorks from '@/components/landing/HowItWorks';
import AlgorithmsSection from '@/components/landing/AlgorithmsSection';
import TechHighlights from '@/components/landing/TechHighlights';
import CTASection from '@/components/landing/CTASection';

export default function HomePage() {
  return (
    <div className="bg-zinc-950 text-zinc-50 min-h-screen">
      <Navbar />
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <AlgorithmsSection />
      <TechHighlights />
      <CTASection />

      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-600 tracking-widest">SHARDLEAK</span>
          <span className="font-mono text-xs text-zinc-700">
            Distributed Rate Limiting Service
          </span>
        </div>
      </footer>
    </div>
  );
}
