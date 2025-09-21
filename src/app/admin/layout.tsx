"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface UserProfile {
  role: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Check user role
      const { data: profileData, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || profileData?.role !== 'admin') {
        router.push('/');
        return;
      }

      setProfile(profileData);
      setLoading(false);
    };

    if (!authLoading) {
      checkAdminAccess();
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return null;
  }

  const navigation = [
    {
      name: 'Documents',
      href: '/admin',
      description: 'Document ingestion and management',
      current: pathname === '/admin' || pathname.startsWith('/admin/documents'),
    },
    {
      name: 'Personas',
      href: '/admin/personas',
      description: 'Persona creation and management',
      current: pathname.startsWith('/admin/personas'),
    },
    {
      name: 'Knowledge Graph',
      href: '/admin/kg',
      description: 'Entity and relationship management',
      current: pathname.startsWith('/admin/kg'),
    },
    {
      name: 'Users',
      href: '/admin/users',
      description: 'User management and permissions',
      current: pathname.startsWith('/admin/users'),
    },
    {
      name: 'Monitoring',
      href: '/admin/monitoring',
      description: 'System health and analytics',
      current: pathname.startsWith('/admin/monitoring'),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-xl font-bold text-gray-900">
              David-GPT Admin
            </Link>
            <span className="text-gray-400">|</span>
            <span className="text-sm text-gray-500">
              Welcome, {user?.email}
            </span>
          </div>
          <div className="ml-auto">
            <Link 
              href="/"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to Chat
            </Link>
          </div>
        </div>
      </div>

      <div className="flex">
        <nav className="w-64 bg-white border-r border-gray-200 min-h-screen">
          <div className="p-4">
            <ul className="space-y-2">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      item.current
                        ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs opacity-75 mt-1">
                      {item.description}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}