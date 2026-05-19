import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { branchApi } from '../api';
import { useAuth } from './AuthContext';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadBranches = useCallback(async () => {
    if (!isAuthenticated || !user?.client_id) {
      setLoading(false);
      return;
    }
    if (user.role === 'super_admin') {
      setLoading(false);
      return;
    }
    try {
      const { data } = await branchApi.getBranches();
      setBranches(data || []);
      if (user.role === 'department') {
        // Dept users locked to their branch
        const myBranch = (data || []).find(b => b.id === user.branch_id) || data?.[0] || null;
        setCurrentBranch(myBranch);
      } else {
        // BA: restore from localStorage
        const savedId = localStorage.getItem(`handleey_branch_${user.client_id}`);
        const saved = (data || []).find(b => b.id === savedId);
        setCurrentBranch(saved || data?.[0] || null);
      }
    } catch (e) {
      setCurrentBranch(null);
    } finally {
      setLoading(false);
    }
  }, [user, isAuthenticated]);

  useEffect(() => {
    setLoading(true);
    loadBranches();
  }, [loadBranches]);

  const selectBranch = useCallback((branch) => {
    if (user?.role === 'department') return; // dept users can't switch
    setCurrentBranch(branch);
    if (user?.client_id) {
      localStorage.setItem(`handleey_branch_${user.client_id}`, branch.id);
    }
  }, [user]);

  const refreshBranches = useCallback(() => loadBranches(), [loadBranches]);

  // Memoise so consumers don't re-render on every Provider render.
  const value = useMemo(
    () => ({ branches, currentBranch, selectBranch, loading, refreshBranches }),
    [branches, currentBranch, selectBranch, loading, refreshBranches]
  );

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}
