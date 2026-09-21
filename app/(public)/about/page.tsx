import { AboutHero } from "@/components/marketing/about/about-hero";
import { AboutMission } from "@/components/marketing/about/about-mission";
import { AboutMetrics } from "@/components/marketing/about/about-metrics";
import { AboutPrinciples } from "@/components/marketing/about/about-principles"; 
import { AboutStory } from "@/components/marketing/about/about-story";
import { AboutTeam } from "@/components/marketing/about/about-team";
import { AboutInvestors } from "@/components/marketing/about/about-investors";
import { AboutLocations } from "@/components/marketing/about/about-locations";
import { AboutCareers } from "@/components/marketing/about/about-careers";
import { AboutInvitation } from "@/components/marketing/about/about-invitation";
import { AboutLegal } from "@/components/marketing/about/about-legal";

export default function AboutPage() {
  return (
  
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-500/10">
      
      <main className="flex-1 w-full">
        <AboutHero />
        <AboutMission />      
        <AboutMetrics />
        <AboutPrinciples /> 
        <AboutStory />
        <AboutTeam />
        <AboutInvestors />
        <AboutLocations />
        <AboutCareers />
        <AboutInvitation />
        <AboutLegal />
      </main>

    </div>
  );
}