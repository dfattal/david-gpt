"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, X } from "lucide-react";

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
  const [showMigrationNotice, setShowMigrationNotice] = useState(true);
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
          {/* Migration Notice */}
          {showMigrationNotice && (pathname === '/admin' || pathname.startsWith('/admin/documents')) && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-800 mb-1">
                    📋 Ingestion System Modernized
                  </h3>
                  <div className="text-sm text-blue-700 space-y-2">
                    <p>
                      The document ingestion system has been modernized to use markdown-first workflows:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>Single documents:</strong> Upload well-formatted markdown files with YAML frontmatter</li>
                      <li><strong>Batch processing:</strong> Upload folders with markdown files (follows /my-corpus structure)</li>
                      <li><strong>Legacy endpoints:</strong> Still available but deprecated (DOI, patent, URL ingestion)</li>
                    </ul>
                    <p className="mt-2">
                      📖 See <code className="bg-blue-100 px-1 rounded">DOCS/CONTENT_GUIDE.md</code> for formatting guidelines and
                      <code className="bg-blue-100 px-1 rounded ml-1">DOCS/Ingestion-Strategies.md</code> for legacy methods.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMigrationNotice(false)}
                  className="ml-2 text-blue-400 hover:text-blue-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}