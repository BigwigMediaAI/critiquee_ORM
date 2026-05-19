import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { superAdminApi } from '../../api';
import { Building2, Users, Star, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

function StatCard({ title, value, icon: Icon, color, sub }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1" style={{ fontFamily: 'Manrope' }}>{value ?? '—'}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon size={20} className="text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SADashboard() {
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([superAdminApi.getStats(), superAdminApi.getClients()])
      .then(([s, c]) => {
        setStats(s.data);
        setClients(c.data.slice(0, 5));
      })
      .catch((err) => console.error('Failed to load stats:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Super Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Overview of all client accounts</p>
        </div>
        <Link
          to="/super-admin/clients"
          data-testid="manage-clients-btn"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
        >
          <Plus size={16} />
          Manage Clients
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Clients" value={stats?.total_clients} icon={Building2} color="bg-blue-500" />
        <StatCard title="Active Clients" value={stats?.active_clients} icon={Users} color="bg-emerald-500" sub={`${stats?.total_clients ? Math.round(stats.active_clients / stats.total_clients * 100) : 0}% active`} />
        <StatCard title="Total Reviews" value={stats?.total_reviews} icon={Star} color="bg-amber-500" />
        <StatCard title="New This Week" value={stats?.new_this_week} icon={TrendingUp} color="bg-violet-500" />
      </div>

      {/* Recent Clients */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>Recent Clients</CardTitle>
            <Link to="/super-admin/clients" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight size={12} />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-10">
              <Building2 size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No clients yet. Create your first client!</p>
              <Link to="/super-admin/clients" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Plus size={14} /> Add client
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map(client => (
                <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                      <span className="text-primary font-bold text-sm">{client.name[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{client.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{client.business_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{client.review_count} reviews</span>
                    <Badge variant={client.is_active ? 'default' : 'secondary'} className="text-xs">
                      {client.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
