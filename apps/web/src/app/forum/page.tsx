'use client';

import { UniforumCanvas } from '@/components/canvas';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ForumPage() {
    const { authenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !authenticated) {
            router.push('/');
        }
    }, [isLoading, authenticated, router]);

    if (isLoading) {
        return (
            <div className="flex bg-slate-950 items-center justify-center min-h-screen text-white">
                Loading...
            </div>
        );
    }

    if (!authenticated) {
        return null; // Redirecting
    }

    return (
        <main className="flex h-screen flex-col bg-slate-950">
            {/* Minimal Header */}
            <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center px-4 justify-between backdrop-blur-sm z-10">
                <div className="font-bold text-white">
                    <span className="text-uniforum-primary">Uni</span>forum Town
                </div>
                {/* Add agent status or wallet info here */}
            </header>

            {/* Main Content: Canvas */}
            <div className="flex-1 relative overflow-hidden">
                <UniforumCanvas />
                
                {/* Floating UI controls could go here */}
            </div>
        </main>
    );
}
