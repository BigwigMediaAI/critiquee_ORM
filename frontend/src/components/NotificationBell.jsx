import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Star,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { notificationApi } from "../api";
import { useBranch } from "../context/BranchContext";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

const TYPE_ICONS = {
  review: Star,
  comment: MessageSquare,
  sync: RefreshCw,
};

const TYPE_COLORS = {
  review: "text-amber-500",
  comment: "text-blue-500",
  sync: "text-emerald-500",
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const prevUnreadRef = useRef(0);
  const audioRef = useRef(null);

  const branchParam = useMemo(
    () => (currentBranch ? { branch_id: currentBranch.id } : {}),
    [currentBranch],
  );

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await notificationApi.getUnreadCount(branchParam);
      const newCount = data.unread_count || 0;

      // Play sound if count increased
      if (newCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
        playSound();
      }
      prevUnreadRef.current = newCount;
      setUnreadCount(newCount);
    } catch (e) {
      // silently ignore
    }
  }, [branchParam]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await notificationApi.getAll({
        ...branchParam,
        limit: 30,
      });
      setNotifications(data.notifications || []);
    } catch (e) {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [branchParam]);

  const playSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(
          "data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAACAgICAgICAgICAgICAgICAgICAgICAgICA/f39/f39/f39/f39/f39/f39/f39/f39/f39+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8v/y8vLy8vLy8vLy8vLy8vLy8vLy+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+gYGBgYGBgYGBgYGBgYGBgYGBgYGBgYH19fX19fX19fX19fX19fX19fX19fX19fXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5bGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxqampqampqampqampqampqampqampqampoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4OD",
        );
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        /* audio autoplay blocked */
      });
    } catch (e) {
      // Audio not supported
    }
  };

  // Poll for unread count every 15s
  useEffect(() => {
    prevUnreadRef.current = -1; // Skip sound on first load
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(timer);
  }, [fetchUnreadCount]);

  // Fetch full list when popover opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const handleMarkRead = async (e, id) => {
    e.stopPropagation();
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      /* ignore */
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead(branchParam);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      /* ignore */
    }
  };

  const handleClickNotif = (notif) => {
    if (!notif.read) {
      notificationApi
        .markRead(notif.id)
        .catch((err) => console.error("Mark read failed:", err));
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="notification-bell"
          className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span
              data-testid="notification-badge"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none animate-pulse"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] p-0 rounded-xl shadow-2xl border border-border"
        data-testid="notification-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs h-7 gap-1 text-primary hover:text-primary"
              data-testid="mark-all-read-btn"
            >
              <CheckCheck size={13} />
              Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[380px]">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-10 text-muted-foreground"
              data-testid="notification-empty"
            >
              <Bell size={28} className="mb-2 opacity-30" />
              <span className="text-sm">No notifications yet</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Bell;
                const iconColor =
                  TYPE_COLORS[n.type] || "text-muted-foreground";
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickNotif(n)}
                    data-testid={`notification-item-${n.id}`}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                      !n.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1.5 rounded-lg bg-muted shrink-0 ${iconColor}`}
                    >
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-snug ${!n.read ? "font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        {n.message}
                      </p>
                      <span className="text-xs text-muted-foreground mt-0.5 block">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {!n.read && (
                      <button
                        onClick={(e) => handleMarkRead(e, n.id)}
                        className="mt-1 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Mark as read"
                        data-testid={`mark-read-${n.id}`}
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
