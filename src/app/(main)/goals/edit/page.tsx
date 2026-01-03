'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Goal, GoalFrequency } from '@/types';

export default function EditGoalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalFrequency, setNewGoalFrequency] = useState<GoalFrequency>('daily');
  const [newGoalWeeklyTarget, setNewGoalWeeklyTarget] = useState(3);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingFrequency, setEditingFrequency] = useState<GoalFrequency>('daily');
  const [editingWeeklyTarget, setEditingWeeklyTarget] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user?.familyId) {
      router.push('/');
      return;
    }

    const goalsQuery = query(
      collection(db, 'goals'),
      where('userId', '==', user.uid),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(goalsQuery, (snapshot) => {
      const goalsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Goal[];
      setGoals(goalsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, router]);

  const handleAddGoal = async () => {
    if (!user?.familyId || !newGoalTitle.trim()) return;
    
    setSaving(true);
    try {
      await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        familyId: user.familyId,
        title: newGoalTitle.trim(),
        createdAt: serverTimestamp(),
        isActive: true,
        frequency: newGoalFrequency,
        ...(newGoalFrequency === 'weekly' && { weeklyTarget: newGoalWeeklyTarget }),
      });
      setNewGoalTitle('');
      setNewGoalFrequency('daily');
      setNewGoalWeeklyTarget(3);
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding goal:', error);
    }
    setSaving(false);
  };

  const handleUpdateGoal = async (goalId: string) => {
    if (!editingTitle.trim()) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, 'goals', goalId), {
        title: editingTitle.trim(),
        frequency: editingFrequency,
        ...(editingFrequency === 'weekly' ? { weeklyTarget: editingWeeklyTarget } : { weeklyTarget: null }),
      });
      setEditingGoalId(null);
      setEditingTitle('');
    } catch (error) {
      console.error('Error updating goal:', error);
    }
    setSaving(false);
  };

  const handleDeleteGoal = async (goalId: string) => {
    setSaving(true);
    try {
      // Soft delete by setting isActive to false
      await updateDoc(doc(db, 'goals', goalId), {
        isActive: false,
      });
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
    setSaving(false);
  };

  const startEditing = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setEditingTitle(goal.title);
    setEditingFrequency(goal.frequency || 'daily');
    setEditingWeeklyTarget(goal.weeklyTarget || 3);
  };

  const getFrequencyLabel = (goal: Goal) => {
    if (goal.frequency === 'weekly') {
      return `${goal.weeklyTarget}x per week`;
    }
    return 'Daily';
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 pt-16 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <button
          onClick={() => router.back()}
          className="w-12 h-12 rounded-full bg-[var(--gray-dark)] flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={() => router.back()}
          className="text-[var(--orange)] font-medium"
        >
          Done
        </button>
      </header>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-4xl font-bold text-white">Edit goals</h1>
        <p className="text-[var(--gray-text)] mt-1">
          {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
        </p>
      </div>

      {/* Goals List */}
      <div className="flex flex-col gap-3 mb-6">
        {goals.map((goal) => (
          <div
            key={goal.id}
            className="w-full bg-[var(--gray-dark)] rounded-2xl px-5 py-4"
          >
            {editingGoalId === goal.id ? (
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  autoFocus
                  className="w-full bg-[var(--gray-card)] rounded-xl px-4 py-3 text-white outline-none"
                  placeholder="Goal name"
                />
                
                {/* Frequency selector */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingFrequency('daily')}
                    className={`flex-1 py-3 rounded-xl font-medium transition-colors
                      ${editingFrequency === 'daily' 
                        ? 'bg-[var(--orange)] text-white' 
                        : 'bg-[var(--gray-card)] text-[var(--gray-text)]'}`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setEditingFrequency('weekly')}
                    className={`flex-1 py-3 rounded-xl font-medium transition-colors
                      ${editingFrequency === 'weekly' 
                        ? 'bg-[var(--orange)] text-white' 
                        : 'bg-[var(--gray-card)] text-[var(--gray-text)]'}`}
                  >
                    Weekly
                  </button>
                </div>

                {/* Weekly target selector */}
                {editingFrequency === 'weekly' && (
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--gray-text)]">Times per week:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingWeeklyTarget(Math.max(1, editingWeeklyTarget - 1))}
                        className="w-10 h-10 rounded-full bg-[var(--gray-card)] text-white flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-white text-xl font-medium w-8 text-center">{editingWeeklyTarget}</span>
                      <button
                        onClick={() => setEditingWeeklyTarget(Math.min(7, editingWeeklyTarget + 1))}
                        className="w-10 h-10 rounded-full bg-[var(--gray-card)] text-white flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingGoalId(null);
                      setEditingTitle('');
                    }}
                    className="flex-1 py-3 bg-[var(--gray-card)] text-white rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpdateGoal(goal.id)}
                    disabled={saving}
                    className="flex-1 py-3 bg-[var(--green)] text-white rounded-xl font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-white font-medium">{goal.title}</span>
                  <p className="text-[var(--gray-text)] text-sm">{getFrequencyLabel(goal)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEditing(goal)}
                    className="w-10 h-10 rounded-full bg-[var(--gray-card)] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 text-[var(--gray-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteGoal(goal.id)}
                    disabled={saving}
                    className="w-10 h-10 rounded-full bg-[var(--gray-card)] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add New Goal */}
      {showAddForm ? (
        <div className="bg-[var(--gray-dark)] rounded-2xl px-5 py-4 flex flex-col gap-4">
          <input
            type="text"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
            autoFocus
            placeholder="Goal name"
            className="w-full bg-[var(--gray-card)] rounded-xl px-4 py-3 text-white placeholder:text-[var(--gray-text)] outline-none"
          />
          
          {/* Frequency selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setNewGoalFrequency('daily')}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors
                ${newGoalFrequency === 'daily' 
                  ? 'bg-[var(--orange)] text-white' 
                  : 'bg-[var(--gray-card)] text-[var(--gray-text)]'}`}
            >
              Daily
            </button>
            <button
              onClick={() => setNewGoalFrequency('weekly')}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors
                ${newGoalFrequency === 'weekly' 
                  ? 'bg-[var(--orange)] text-white' 
                  : 'bg-[var(--gray-card)] text-[var(--gray-text)]'}`}
            >
              Weekly
            </button>
          </div>

          {/* Weekly target selector */}
          {newGoalFrequency === 'weekly' && (
            <div className="flex items-center gap-3">
              <span className="text-[var(--gray-text)]">Times per week:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewGoalWeeklyTarget(Math.max(1, newGoalWeeklyTarget - 1))}
                  className="w-10 h-10 rounded-full bg-[var(--gray-card)] text-white flex items-center justify-center"
                >
                  -
                </button>
                <span className="text-white text-xl font-medium w-8 text-center">{newGoalWeeklyTarget}</span>
                <button
                  onClick={() => setNewGoalWeeklyTarget(Math.min(7, newGoalWeeklyTarget + 1))}
                  className="w-10 h-10 rounded-full bg-[var(--gray-card)] text-white flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewGoalTitle('');
                setNewGoalFrequency('daily');
                setNewGoalWeeklyTarget(3);
              }}
              className="flex-1 py-3 bg-[var(--gray-card)] text-white rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAddGoal}
              disabled={!newGoalTitle.trim() || saving}
              className="flex-1 py-3 bg-[var(--orange)] text-white rounded-xl font-medium disabled:opacity-50"
            >
              Add Goal
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full bg-[var(--gray-dark)] rounded-2xl px-5 py-4 flex items-center justify-center gap-2 text-[var(--gray-text)]"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add a new goal
        </button>
      )}
    </div>
  );
}
