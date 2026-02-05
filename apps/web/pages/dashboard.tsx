import CreateAgentModal from '@/components/CreateAgentModal';
import Button from '@/components/ui/button';
import { useState } from 'react';

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleAgentCreation = () => {
    setIsModalOpen(true);
  };
  return (
    <div>
      Dashboard
      <Button onClick={handleAgentCreation} size="medium">
        Create Agent
      </Button>
      {isModalOpen && <CreateAgentModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
