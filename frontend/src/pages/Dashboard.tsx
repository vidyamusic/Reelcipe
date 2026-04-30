import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Sparkles, LogOut, Loader2, CheckCircle2, AlertCircle, Trash2, Globe, ListOrdered, X, Star, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Recipe {
  id: string;
  reel_url: string;
  title: string | null;
  status: 'pending' | 'extracting' | 'completed' | 'failed';
  parsed_ingredients: any[];
  parsed_steps: any[];
  thumbnail_url: string | null;
  is_published: boolean;
  user_comment: string | null;
  has_made: boolean;
  rating: number | null;
  error_message: string | null;
  created_at: string;
  user_id: string;
}

const StarRating = ({ rating, onChange }: { rating: number, onChange?: (r: number) => void }) => {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          className={`focus:outline-none transition-colors ${!onChange ? 'cursor-default' : 'hover:scale-110'}`}
        >
          <Star className={`w-5 h-5 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}`} />
        </button>
      ))}
    </div>
  );
};

const PublishModal = ({ isOpen, onClose, onPublish, recipeTitle }: { isOpen: boolean, onClose: () => void, onPublish: (comment: string) => void, recipeTitle: string }) => {
  const [comment, setComment] = useState('');
  
  useEffect(() => {
    if (isOpen) setComment('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#111] border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-xl">
        <h3 className="text-xl font-semibold text-white mb-2">Publish Recipe</h3>
        <p className="text-sm text-gray-400 mb-4">Share "{recipeTitle}" with the community.</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment about your experience making this recipe..."
          className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-600 mb-6 min-h-[100px]"
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => { onPublish(comment); onClose(); }} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primaryHover transition-colors">Publish</button>
        </div>
      </motion.div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { user, session, signOut } = useAuth();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [extractingRecipeId, setExtractingRecipeId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [popularRecipes, setPopularRecipes] = useState<Recipe[]>([]);
  const [activeTab, setActiveTab] = useState<'library' | 'popular'>('library');

  // Modals state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [recipeToPublish, setRecipeToPublish] = useState<{id: string, title: string} | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    fetchRecipes();
    fetchPopularRecipes();

    const channel = supabase
      .channel('public:saved_recipes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_recipes' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setRecipes((prev) => prev.filter((r) => r.id !== payload.old.id));
            setPopularRecipes((prev) => prev.filter((r) => r.id !== payload.old.id));
            return;
          }

          if (payload.new && payload.new.user_id === user?.id) {
            if (payload.eventType === 'INSERT') {
              setRecipes((prev) => [payload.new as Recipe, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setRecipes((prev) =>
                prev.map((r) => (r.id === payload.new.id ? (payload.new as Recipe) : r))
              );
            }
          }
          
          // Always refresh popular recipes on updates or inserts to stay perfectly in sync
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
             fetchPopularRecipes();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Sync viewingRecipe with fresh data if it changes in the background
  useEffect(() => {
    if (viewingRecipe) {
      const activeRecipe = recipes.find(r => r.id === viewingRecipe.id);
      if (activeRecipe) setViewingRecipe(activeRecipe);
    }
  }, [recipes]);

  // Monitor the extracting recipe to clear loading state
  useEffect(() => {
    if (extractingRecipeId) {
      const activeRecipe = recipes.find(r => r.id === extractingRecipeId);
      if (activeRecipe) {
        if (activeRecipe.status === 'completed') {
          setLoading(false);
          setExtractingRecipeId(null);
          setUrl('');
        } else if (activeRecipe.status === 'failed') {
          setLoading(false);
          setExtractingRecipeId(null);
          alert(`Extraction failed: ${activeRecipe.error_message}`);
          // Clean up the failed object from database and state automatically
          handleDelete(activeRecipe.id);
        }
      }
    }
  }, [recipes, extractingRecipeId]);

  const fetchRecipes = async () => {
    const { data } = await supabase
      .from('saved_recipes')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });
    
    if (data) setRecipes(data as Recipe[]);
  };

  const fetchPopularRecipes = async () => {
    const { data } = await supabase
      .from('saved_recipes')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) setPopularRecipes(data as Recipe[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('saved_recipes')
        .insert([{ user_id: user?.id, reel_url: url, status: 'pending' }])
        .select()
        .single();

      if (error) throw error;
      setExtractingRecipeId(data.id);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const res = await fetch(`${apiUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_id: data.id,
          reel_url: url,
          user_token: session?.access_token,
        }),
      });

      if (!res.ok) throw new Error('Worker failed to start');
      
      setActiveTab('library');
    } catch (error: any) {
      console.error('Extraction error:', error);
      alert(`Failed to start extraction: ${error.message || error.details || JSON.stringify(error)}`);
      setLoading(false);
      setExtractingRecipeId(null);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    if (viewingRecipe?.id === id) setViewingRecipe(null);

    const { error } = await supabase.from('saved_recipes').delete().eq('id', id);
    if (error) {
      alert("Error deleting recipe");
      fetchRecipes();
    }
  };

  const updateRecipeState = async (id: string, updates: Partial<Recipe>) => {
    // Optimistic update for both lists
    setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
    setPopularRecipes((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));

    const { error } = await supabase.from('saved_recipes').update(updates).eq('id', id);
    if (error) {
      alert("Error updating recipe");
      fetchRecipes(); 
      fetchPopularRecipes();
    }
  };

  const handlePublishToggle = (recipe: Recipe) => {
    if (!recipe.is_published) {
      setRecipeToPublish({ id: recipe.id, title: recipe.title || 'Untitled Recipe' });
      setIsPublishModalOpen(true);
    } else {
      executePublish(recipe.id, true, null);
    }
  };

  const executePublish = async (id: string, currentlyPublished: boolean, comment: string | null) => {
    await updateRecipeState(id, { is_published: !currentlyPublished, user_comment: comment });
    fetchPopularRecipes(); // Ensure we fetch after DB is truly updated
  };

  const renderRecipeCard = (recipe: Recipe, isPopularView: boolean = false) => {
    // Only show successfully completed recipes in the library view
    if (!isPopularView && recipe.status !== 'completed') return null;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        key={recipe.id}
        onClick={() => recipe.status === 'completed' && setViewingRecipe(recipe)}
        className="glass p-0 rounded-2xl flex flex-col h-full relative group overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
      >
        <div className="h-40 w-full relative bg-black/40 overflow-hidden shrink-0">
           {recipe.thumbnail_url ? (
             <img src={recipe.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
           ) : (
             <div className="w-full h-full flex items-center justify-center">
                 <Sparkles className="w-8 h-8 text-white/20" />
             </div>
           )}
           <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent"></div>
           
           {!isPopularView && (
               <button 
                onClick={(e) => handleDelete(recipe.id, e)} 
                className="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-20 backdrop-blur-md"
               >
                   <Trash2 className="w-4 h-4" />
               </button>
           )}
        </div>

        <div className="p-6 relative z-10 flex flex-col flex-1 -mt-8">
          <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-white line-clamp-2 text-lg">
              {recipe.title || 'Untitled Recipe'}
              </h3>
          </div>

          {recipe.status === 'completed' ? (
              <div className="flex-1 flex flex-col">
                {(isPopularView || recipe.rating) && (
                   <div className="mb-3">
                       <StarRating rating={recipe.rating || 0} />
                   </div>
                )}
                {isPopularView && recipe.user_comment && (
                  <div className="mb-4 bg-white/5 p-3 rounded-lg border border-white/10">
                      <p className="text-sm italic text-gray-300">"{recipe.user_comment}"</p>
                  </div>
                )}
              
                <div className="mb-4">
                  <p className="text-xs font-medium text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Ingredients
                  </p>
                  <ul className="space-y-1">
                      {recipe.parsed_ingredients?.slice(0, 3).map((ing, i) => (
                      <li key={i} className="text-sm text-gray-300 flex justify-between bg-black/20 p-2 rounded-lg">
                          <span className="truncate mr-2">{ing.item_name}</span>
                          <span className="text-gray-400 whitespace-nowrap">{ing.quantity} {ing.unit}</span>
                      </li>
                      ))}
                      {recipe.parsed_ingredients?.length > 3 && (
                      <li className="text-xs text-gray-400 italic pt-1 text-center">
                          + {recipe.parsed_ingredients.length - 3} more ingredients
                      </li>
                      )}
                  </ul>
                </div>
                
                <p className="text-xs text-gray-500 text-center mt-auto pt-2">Click to view full recipe</p>
              </div>
          ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-500">
                  <span className="text-sm text-red-400 text-center">{recipe.error_message || 'Extraction failed'}</span>
              </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative px-4 py-8 max-w-6xl mx-auto">
      <PublishModal 
        isOpen={isPublishModalOpen} 
        onClose={() => { setIsPublishModalOpen(false); setRecipeToPublish(null); }} 
        onPublish={(comment) => {
          if (recipeToPublish) {
            executePublish(recipeToPublish.id, false, comment);
          }
        }}
        recipeTitle={recipeToPublish?.title || ''}
      />

      {/* Recipe Full Modal */}
      <AnimatePresence>
        {viewingRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-4 md:py-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 20 }}
              className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-4xl max-h-full overflow-hidden shadow-2xl flex flex-col relative"
            >
              {/* Modal Header/Image */}
              <div className="h-48 md:h-64 w-full relative bg-black shrink-0">
                {viewingRecipe.thumbnail_url ? (
                    <img src={viewingRecipe.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover opacity-60" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/20">
                        <Sparkles className="w-12 h-12 text-primary/50" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent"></div>
                <button 
                  onClick={() => setViewingRecipe(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors backdrop-blur-md z-10"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="absolute bottom-6 left-6 right-6">
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{viewingRecipe.title || 'Untitled Recipe'}</h2>
                  {viewingRecipe.is_published && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/20 text-primary text-xs font-medium"><Globe className="w-3 h-3"/> Published</span>}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 p-6 flex flex-col md:flex-row gap-8">
                
                {/* Left Col: Ingredients */}
                <div className="md:w-1/3">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" /> Ingredients
                  </h3>
                  <ul className="space-y-2">
                    {viewingRecipe.parsed_ingredients?.map((ing, i) => (
                      <li key={i} className="text-sm text-gray-300 flex justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                        <span>{ing.item_name}</span>
                        <span className="text-gray-400 font-medium">{ing.quantity} {ing.unit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Right Col: Steps */}
                <div className="md:w-2/3 flex flex-col">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <ListOrdered className="w-5 h-5 text-accent" /> Instructions
                  </h3>
                  <div className="space-y-4 mb-8">
                    {viewingRecipe.parsed_steps?.map((step, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold shrink-0">{step.step_number}</div>
                        <p className="text-gray-300 mt-1 leading-relaxed">{step.instruction}</p>
                      </div>
                    ))}
                  </div>

                  {/* Actions Section (only if it's the user's recipe) */}
                  {viewingRecipe.user_id === user?.id && (
                    <div className="mt-auto bg-black/40 border border-white/5 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                           <h4 className="text-white font-medium mb-1">Did you make this?</h4>
                           <p className="text-sm text-gray-400">Mark it as cooked to unlock rating and publishing.</p>
                        </div>
                        <button
                          onClick={() => updateRecipeState(viewingRecipe.id, { has_made: !viewingRecipe.has_made })}
                          className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${viewingRecipe.has_made ? 'bg-green-500 justify-end' : 'bg-gray-700 justify-start'}`}
                        >
                          <motion.div layout className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                            {viewingRecipe.has_made && <Check className="w-4 h-4 text-green-500" />}
                          </motion.div>
                        </button>
                      </div>

                      {viewingRecipe.has_made && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-white/10 pt-6">
                          <div className="flex items-center justify-between mb-6">
                            <span className="text-sm text-gray-300">Your Rating</span>
                            <StarRating 
                              rating={viewingRecipe.rating || 0} 
                              onChange={(val) => updateRecipeState(viewingRecipe.id, { rating: val })} 
                            />
                          </div>

                          <button
                              onClick={() => handlePublishToggle(viewingRecipe)}
                              className={`w-full py-3 rounded-xl transition-colors font-semibold flex items-center justify-center gap-2
                              ${viewingRecipe.is_published 
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                                  : 'bg-primary text-white hover:bg-primaryHover'}`}
                          >
                              <Globe className="w-5 h-5" />
                              {viewingRecipe.is_published ? 'Unpublish from Community' : 'Publish to Community'}
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-primary to-accent rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="text-white w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            Reelcipe
          </h1>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </header>

      {/* Input Section */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6 md:p-8 mb-12 border border-white/5 bg-white/5"
      >
        <h2 className="text-xl font-semibold text-white mb-2">Extract New Recipe</h2>
        <p className="text-gray-400 mb-6 text-sm">Paste an Instagram Reel URL to instantly extract ingredients and steps.</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-600 disabled:opacity-50"
              placeholder="https://www.instagram.com/reel/..."
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url}
            className="bg-gradient-to-r from-primary to-primaryHover text-white font-semibold px-8 py-4 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all flex items-center justify-center gap-2 min-w-[160px] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Extract'}
            {!loading && <Sparkles className="w-5 h-5" />}
          </button>
        </form>
      </motion.section>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-white/10 pb-4">
        <button 
          onClick={() => setActiveTab('library')}
          className={`text-lg font-medium transition-all ${activeTab === 'library' ? 'text-white border-b-2 border-primary pb-4 -mb-[18px]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          My Library
        </button>
        <button 
          onClick={() => setActiveTab('popular')}
          className={`text-lg font-medium transition-all flex items-center gap-2 ${activeTab === 'popular' ? 'text-white border-b-2 border-primary pb-4 -mb-[18px]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Globe className="w-5 h-5" /> Popular Recipes
        </button>
      </div>

      {/* Content Section */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {activeTab === 'library' && recipes.map(recipe => renderRecipeCard(recipe, false))}
            {activeTab === 'popular' && popularRecipes.map(recipe => renderRecipeCard(recipe, true))}
          </AnimatePresence>
          
          {activeTab === 'library' && recipes.filter(r => r.status === 'completed' || r.status === 'failed').length === 0 && !loading && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="col-span-full py-12 flex flex-col items-center justify-center text-gray-500 glass rounded-2xl border-dashed border-white/10">
              <Sparkles className="w-8 h-8 mb-3 opacity-50" />
              <p>No recipes yet. Paste a link above to get started!</p>
            </motion.div>
          )}

          {activeTab === 'popular' && popularRecipes.length === 0 && (
             <motion.div initial={{opacity:0}} animate={{opacity:1}} className="col-span-full py-12 flex flex-col items-center justify-center text-gray-500 glass rounded-2xl border-dashed border-white/10">
               <Globe className="w-8 h-8 mb-3 opacity-50" />
               <p>No popular recipes yet. Be the first to publish one!</p>
             </motion.div>
          )}
        </div>
      </section>
    </div>
  );
};
