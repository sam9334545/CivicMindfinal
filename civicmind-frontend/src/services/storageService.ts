import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask } from "firebase/storage";
import { storage } from "../config/firebase";

export class StorageService {
  /**
   * Uploads issue media file with progress feedback.
   */
  static uploadIssueMedia(
    issueId: string,
    file: File,
    onProgress: (progress: number) => void,
    onComplete: (downloadUrl: string) => void,
    onError: (error: any) => void
  ): { cancel: () => void; task: UploadTask } {
    const fileExtension = file.name.split(".").pop() || "bin";
    const storagePath = `issues/${issueId}/original.${fileExtension}`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(Math.round(progress));
      },
      (error) => {
        console.error("[StorageService] Upload failed", { issueId, storagePath, error });
        onError(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onComplete(downloadUrl);
        } catch (urlErr) {
          console.error("[StorageService] Failed to retrieve download URL", urlErr);
          onError(urlErr);
        }
      }
    );

    return {
      cancel: () => uploadTask.cancel(),
      task: uploadTask,
    };
  }

  static async deleteIssueMedia(issueId: string, fileExtension: string): Promise<void> {
    const storagePath = `issues/${issueId}/original.${fileExtension}`;
    const storageRef = ref(storage, storagePath);
    try {
      await deleteObject(storageRef);
      console.log(`[StorageService] Cleanup deleted media for issue ${issueId}`);
    } catch (error) {
      console.warn(`[StorageService] Cleanup failed for issue ${issueId}:`, error);
    }
  }
}
