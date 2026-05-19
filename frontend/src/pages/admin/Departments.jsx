import { useState, useEffect, useCallback } from "react";
import { departmentApi } from "../../api";
import { useBranch } from "../../context/BranchContext";
import { toast } from "sonner";
import {
  Plus,
  Users,
  Trash2,
  UserPlus,
  KeyRound,
  Edit2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import DataPagination, { usePagination } from "../../components/DataPagination";

function DeptModal({ open, onClose, onSaved, dept }) {
  const { currentBranch } = useBranch();
  const [form, setForm] = useState({
    name: "",
    description: "",
    approval_required: true,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dept)
      setForm({
        name: dept.name,
        description: dept.description || "",
        approval_required: dept.approval_required,
      });
    else setForm({ name: "", description: "", approval_required: true });
  }, [dept, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error("Name is required");
    setLoading(true);
    try {
      if (dept) await departmentApi.updateDepartment(dept.id, form);
      else
        await departmentApi.createDepartment({
          ...form,
          branch_id: currentBranch?.id,
        });
      toast.success(dept ? "Department updated" : "Department created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save department");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Manrope" }}>
            {dept ? "Edit Department" : "New Department"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Department Name *
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Front Desk"
              data-testid="dept-name-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Department description..."
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  approval_required: !f.approval_required,
                }))
              }
              className={`w-10 h-5 rounded-full transition-all ${form.approval_required ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.approval_required ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <span className="text-sm text-foreground">
              Require approval for replies
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              data-testid="save-dept-btn"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : null}
              {dept ? "Update" : "Create"} Department
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddUserModal({ open, onClose, dept, onAdded }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) setForm({ name: "", email: "", password: "" });
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password)
      return toast.error("All fields required");
    setLoading(true);
    try {
      await departmentApi.createDeptUser(dept.id, form);
      toast.success(
        "User created. They can now log in with these credentials.",
      );
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Manrope" }}>
            Add User to {dept?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {["name", "email", "password"].map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1.5 capitalize">
                {field} *
              </label>
              <input
                type={
                  field === "password"
                    ? "password"
                    : field === "email"
                      ? "email"
                      : "text"
                }
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form[field]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [field]: e.target.value }))
                }
                placeholder={
                  field === "name"
                    ? "Jane Smith"
                    : field === "email"
                      ? "jane@hotel.com"
                      : "••••••••"
                }
                data-testid={`user-${field}-input`}
              />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              data-testid="create-user-btn"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : null}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Departments() {
  const { currentBranch } = useBranch();
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [addUserDept, setAddUserDept] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);
  const [deptUsers, setDeptUsers] = useState({});

  const fetchDepts = useCallback(() => {
    setLoading(true);
    const params = currentBranch ? { branch_id: currentBranch.id } : {};
    departmentApi
      .getDepartments(params)
      .then(({ data }) => setDepts(data))
      .catch((err) => console.error("Failed to load departments:", err))
      .finally(() => setLoading(false));
  }, [currentBranch]);

  useEffect(() => {
    fetchDepts();
  }, [fetchDepts]);

  const handleExpand = async (deptId) => {
    if (expandedDept === deptId) {
      setExpandedDept(null);
      return;
    }
    setExpandedDept(deptId);
    if (!deptUsers[deptId]) {
      try {
        const { data } = await departmentApi.getDeptUsers(deptId);
        setDeptUsers((p) => ({ ...p, [deptId]: data }));
      } catch (e) {
        console.error("Failed to load dept users:", e);
      }
    }
  };

  const handleDelete = async (dept) => {
    if (!window.confirm(`Delete department "${dept.name}"?`)) return;
    try {
      await departmentApi.deleteDepartment(dept.id);
      toast.success("Department deleted");
      fetchDepts();
    } catch (e) {
      toast.error("Failed to delete department");
    }
  };

  const handleResetPassword = async (deptId, userId) => {
    const pwd = prompt("Enter new password:");
    if (!pwd) return;
    try {
      await departmentApi.resetDeptUserPassword(deptId, userId, {
        new_password: pwd,
      });
      toast.success("Password reset successfully");
    } catch (e) {
      toast.error("Failed to reset password");
    }
  };

  const pagination = usePagination(depts, 10, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>
            Departments
          </h1>
          <p className="text-sm text-muted-foreground">
            {depts.length} department{depts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-2"
          data-testid="add-dept-btn"
        >
          <Plus size={16} /> Add Department
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : depts.length === 0 ? (
        <div className="text-center py-16">
          <Users size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No departments yet</p>
          <Button
            className="mt-4"
            onClick={() => setShowCreate(true)}
            size="sm"
          >
            Create Department
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pagination.pageItems.map((dept) => {
            const expanded = expandedDept === dept.id;
            const users = deptUsers[dept.id] || [];
            return (
              <Card key={dept.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground">
                          {dept.name}
                        </p>
                        {dept.pending_count > 0 && (
                          <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                            {dept.pending_count} pending
                          </Badge>
                        )}
                        {dept.draft_count > 0 && (
                          <Badge className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 border-0">
                            {dept.draft_count} drafts
                          </Badge>
                        )}
                      </div>
                      {dept.description && (
                        <p className="text-xs text-muted-foreground">
                          {dept.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground">
                          {dept.user_count} user
                          {dept.user_count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dept.approval_required
                            ? "• Approval required"
                            : "• Direct posting"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setAddUserDept(dept);
                        }}
                        data-testid={`add-user-${dept.id}`}
                      >
                        <UserPlus size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditDept(dept)}
                        data-testid={`edit-dept-${dept.id}`}
                      >
                        <Edit2 size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(dept)}
                        data-testid={`delete-dept-${dept.id}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleExpand(dept.id)}
                        data-testid={`expand-dept-${dept.id}`}
                      >
                        {expanded ? (
                          <ChevronUp size={15} />
                        ) : (
                          <ChevronDown size={15} />
                        )}
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-border animate-slide-up">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Users
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => setAddUserDept(dept)}
                        >
                          <Plus size={11} /> Add User
                        </Button>
                      </div>
                      {users.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No users yet
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {users.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {u.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {u.email}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() =>
                                  handleResetPassword(dept.id, u.id)
                                }
                              >
                                <KeyRound size={11} /> Reset Password
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <DataPagination
            {...pagination}
            itemLabel="departments"
            testIdPrefix="depts-pagination"
            className="mt-2 bg-card rounded-xl border border-border"
          />
        </div>
      )}

      <DeptModal
        open={showCreate || !!editDept}
        onClose={() => {
          setShowCreate(false);
          setEditDept(null);
        }}
        dept={editDept}
        onSaved={fetchDepts}
      />
      {addUserDept && (
        <AddUserModal
          open={!!addUserDept}
          onClose={() => setAddUserDept(null)}
          dept={addUserDept}
          onAdded={() => {
            const id = addUserDept.id;
            departmentApi
              .getDeptUsers(id)
              .then(({ data }) => setDeptUsers((p) => ({ ...p, [id]: data })));
            fetchDepts();
          }}
        />
      )}
    </div>
  );
}
