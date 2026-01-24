import React, { useEffect, useState } from 'react';
import { IconHome, IconDatabase } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export function useSearchActions() {
  const navigate = useNavigate();
  
  const [baseActions] = useState([
    {
      id: 'home',
      label: 'Home',
      description: 'Go to home page',
      leftSection: <IconHome size={24} />,
      onTrigger: () => navigate('/'),
    },
    {
      id: 'facts',
      label: 'Fact Database',
      description: 'Browse all facts',
      leftSection: <IconDatabase size={24} />,
      onTrigger: () => navigate('/facts'),
    },
  ]);

  const [factActions, setFactActions] = useState([]);

  useEffect(() => {
    // Load facts for search index
    axios.get('/api/facts/facts?limit=50&offset=0')
      .then(res => {
        const actions = (res.data || []).map(fact => ({
          id: `fact-${fact.id}`,
          label: (fact.title || fact.fact_text)?.substring(0, 60),
          description: `View fact #${fact.id}`,
          onTrigger: () => navigate(`/facts/${fact.id}`),
        }));
        setFactActions(actions);
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
  }, [navigate]);

  return [...baseActions, ...factActions];
}

