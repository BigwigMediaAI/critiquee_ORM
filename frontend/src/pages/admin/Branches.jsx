import { useState, useEffect } from 'react';
import { branchApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import {
  Plus, GitBranch, Edit2, Trash2, Loader2, Star, MessageSquare,
  Users, CheckCircle, XCircle, MapPin
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '../../components/ui/dialog';
import DataPagination, { usePagination } from '../../components/DataPagination';

function BranchModal({ open, onClose, onSaved, branch }) {
  const [form, setForm] = useState({ name: '', address: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (branch) setForm({ name: branch.name, address: branch.address || '' });
    else setForm({ name: '', address: '' });
  }, [branch, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Branch name is required');
    setLoading(true);
    try {
      if (branch) {
        await branchApi.updateBranch(branch.id, form);
        toast.success('Branch updated');
      } else {
        await branchApi.createBranch(form);
        toast.success('Branch created');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save branch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Manrope' }}>
            {branch ? 'Edit Branch' : 'Add New Branch'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Branch Name *</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. ABC Hotel – Ranchi"
              data-testid="branch-name-input"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Address (optional)</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="123 Main Street, City"
              data-testid="branch-address-input"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="save-branch-btn">
              {loading && <Loader2 size={14} className="animate-spin mr-1" />}
              {branch ? 'Update Branch' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Branches() {
  const { branches, currentBranch, selectBranch, refreshBranches } = useBranch();
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editBranch, setEditBranch] = useState(null);

  const handleDelete = async (branch) => {
    if (!window.confirm(`Delete branch "${branch.name}"? This cannot be undone.`)) return;
    try {
      await branchApi.deleteBranch(branch.id);
      toast.success('Branch deleted');
      refreshBranches();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete branch');
    }
  };

  const handleSwitchTo = (branch) => {
    selectBranch(branch);
    toast.success(`Switched to ${branch.name}`);
  };

  const pagination = usePagination(branches, 12, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Branches</h1>
          <p className="text-sm text-muted-foreground">
            {branches.length} branch{branches.length !== 1 ? 'es' : ''} — each is a separate workspace
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2" data-testid="add-branch-btn">
          <Plus size={16} /> Add Branch
        </Button>
      </div>

      {/* Currently selected banner */}
      {currentBranch && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
          <GitBranch size={16} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Active Workspace: <span className="text-primary">{currentBranch.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">All data across the dashboard is scoped to this branch</p>
          </div>
        </div>
      )}

      {/* Branch cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pagination.pageItems.map(branch => {
          const isActive = currentBranch?.id === branch.id;
          return (
            <Card
              key={branch.id}
              className={`hover:shadow-md transition-shadow ${isActive ? 'border-primary/40 bg-primary/2' : ''}`}
              data-testid={`branch-card-${branch.id}`}
            >
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <GitBranch size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-foreground text-sm truncate">{branch.name}</p>
                      {isActive && (
                        <Badge className="text-xs bg-primary/10 text-primary border-0 shrink-0">Active</Badge>
                      )}
                    </div>
                    {branch.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <MapPin size={11} /> {branch.address}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1"><Star size={11} /> {branch.review_count || 0} reviews</span>
                      <span className="flex items-center gap-1"><MessageSquare size={11} /> {branch.post_count || 0} posts</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {branch.dept_count || 0} depts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleSwitchTo(branch)}
                          data-testid={`switch-branch-${branch.id}`}
                        >
                          <CheckCircle size={11} /> Switch to this
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => setEditBranch(branch)}
                        data-testid={`edit-branch-${branch.id}`}
                      >
                        <Edit2 size={11} /> Edit
                      </Button>
                      {branches.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(branch)}
                          data-testid={`delete-branch-${branch.id}`}
                        >
                          <Trash2 size={11} /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <DataPagination {...pagination} itemLabel="branches" testIdPrefix="branches-pagination" pageSizeOptions={[12, 24, 48]} className="bg-card rounded-xl border border-border" />

      <BranchModal
        open={showCreate || !!editBranch}
        onClose={() => { setShowCreate(false); setEditBranch(null); }}
        branch={editBranch}
        onSaved={refreshBranches}
      />
    </div>
  );
}
