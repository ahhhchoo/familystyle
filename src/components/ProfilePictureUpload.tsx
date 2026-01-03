'use client';

import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';

interface ProfilePictureUploadProps {
  userId: string;
  currentPhotoURL: string | null;
  customPhotoURL?: string | null;
  displayName: string;
  onUploadComplete?: (newPhotoURL: string) => void;
}

export default function ProfilePictureUpload({
  userId,
  currentPhotoURL,
  customPhotoURL,
  displayName,
  onUploadComplete,
}: ProfilePictureUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use custom photo if available, otherwise fall back to Google photo
  const displayPhotoURL = customPhotoURL || currentPhotoURL;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewURL(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Firebase Storage
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `profile-pictures/${userId}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Update user document in Firestore
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        customPhotoURL: downloadURL,
      });

      onUploadComplete?.(downloadURL);
      setPreviewURL(null);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload image. Please try again.');
      setPreviewURL(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveCustomPhoto = async () => {
    if (!customPhotoURL) return;

    setIsUploading(true);
    try {
      // Update user document to remove custom photo
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        customPhotoURL: null,
      });

      onUploadComplete?.('');
    } catch (error) {
      console.error('Error removing profile picture:', error);
      alert('Failed to remove image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Profile Picture Display */}
      <div className="relative">
        <button
          onClick={triggerFileInput}
          disabled={isUploading}
          className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white/20 
                     hover:border-white/40 transition-colors focus:outline-none focus:border-white/60"
        >
          {previewURL || displayPhotoURL ? (
            <img
              src={previewURL || displayPhotoURL || ''}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[var(--gray-card)] flex items-center justify-center">
              <span className="text-3xl font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Upload overlay */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            {isUploading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
        </button>

        {/* Remove button (only show if custom photo exists) */}
        {customPhotoURL && !isUploading && (
          <button
            onClick={handleRemoveCustomPhoto}
            className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center
                       hover:bg-red-600 transition-colors"
            title="Remove custom photo"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Help text */}
      <p className="text-[var(--gray-text)] text-xs text-center">
        Tap to change photo
        <br />
        Max 5MB, JPG/PNG
      </p>
    </div>
  );
}
