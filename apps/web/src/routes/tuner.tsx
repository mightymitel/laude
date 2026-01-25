import { createFileRoute } from '@tanstack/react-router';
import { Tuner } from '@/components/Tuner/Tuner';

export const Route = createFileRoute('/tuner')({
    component: TunerPage,
});

function TunerPage() {
    return (
        <div style={{ padding: '20px', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Tuner mode="full" />
        </div>
    );
}
