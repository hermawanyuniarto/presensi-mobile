import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const API_URL = "http://10.28.9.86/presensi-api/public/api";
const API_KEY = "RSSA-DIKLIT-SECURE-2026"; // Sandi Rahasia Anti-Hacker

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingLogin, setIsCheckingLogin] = useState(true);
  const [nim, setNim] = useState("");
  const [password, setPassword] = useState("");
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("home");
  const [currentTime, setCurrentTime] = useState(new Date());

  const [shiftsData, setShiftsData] = useState<any[]>([]);
  const [selectedShift, setSelectedShift] = useState("");
  const [isShiftDropdownOpen, setIsShiftDropdownOpen] = useState(false);

  const [rssaLat, setRssaLat] = useState(-7.969608);
  const [rssaLon, setRssaLon] = useState(112.630045);
  const [radiusMaksimal, setRadiusMaksimal] = useState(500);

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [distanceToRSSA, setDistanceToRSSA] = useState<number | null>(null);
  const [isInRadius, setIsInRadius] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const [ijinType, setIjinType] = useState("Sakit");
  const [ijinDate, setIjinDate] = useState("");
  const [ijinReason, setIjinReason] = useState("");
  const [ijinFile, setIjinFile] = useState("");

  const [facing, setFacing] = useState<"front" | "back">("front");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [presensiType, setPresensiType] = useState("");
  const [presensiStatus, setPresensiStatus] = useState("");
  const [popupMessage, setPopupMessage] = useState({ visible: false, title: "", message: "", type: "success" });
  const [confirmDialog, setConfirmDialog] = useState({ visible: false, title: "", message: "", presensiType: "", presensiStatus: "" });

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [activeDatePicker, setActiveDatePicker] = useState<"start" | "end" | "ijin" | null>(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const cameraRef = useRef<any>(null);

  useEffect(() => {
    checkLoginStatus(); // Panggil fungsi cek memori saat aplikasi pertama kali dibuka
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // FUNGSI BARU: Mengecek apakah sebelumnya user sudah login
  const checkLoginStatus = async () => {
    try {
      const storedUser = await AsyncStorage.getItem("@user_data");
      if (storedUser) {
        setUserData(JSON.parse(storedUser));
        setIsLoggedIn(true);
      }
    } catch (e) {
      console.log("Gagal membaca memori HP:", e);
    } finally {
      setIsCheckingLogin(false); // Matikan layar loading
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchConfig();
      fetchHistory(); // Default memanggil tanpa parameter (Hari Ini)
      fetchShifts();
    }
  }, [isLoggedIn]);

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/konfigurasi`);
      const json = await response.json();
      if (json.success && json.data) {
        if (json.data.latitude) setRssaLat(parseFloat(json.data.latitude));
        if (json.data.longitude) setRssaLon(parseFloat(json.data.longitude));
        if (json.data.radius) setRadiusMaksimal(parseInt(json.data.radius));
        checkLocation(parseFloat(json.data.latitude), parseFloat(json.data.longitude), parseInt(json.data.radius));
      } else {
        checkLocation(rssaLat, rssaLon, radiusMaksimal);
      }
    } catch (error) {
      console.log("Error fetch config, using fallback defaults.");
      checkLocation(rssaLat, rssaLon, radiusMaksimal);
    }
  };

  const timeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  };

  const handleLogin = async () => {
    if (!nim || !password) {
      showPopup("Gagal", "NIM dan Password wajib diisi!", "error");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ nim, password }),
      });
      const json = await response.json();
      if (json.success) {
        setUserData(json.data);
        setIsLoggedIn(true);
        // SIMPAN KE BRANKAS: Ingat pengguna ini untuk seterusnya!
        await AsyncStorage.setItem("@user_data", JSON.stringify(json.data));
      } else {
        showPopup("Login Gagal", json.message, "error");
      }
    } catch (error) {
      showPopup("Error Koneksi", "Gagal terhubung ke Server.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggedIn(false);
    setNim("");
    setPassword("");
    setUserData(null);
    setShiftsData([]);
    setHistoryData([]);
    setIsFilterActive(false);
    setStartDate("");
    setEndDate("");
    setIjinDate("");
    // HAPUS DARI BRANKAS: Lupakan pengguna ini saat mereka sengaja Logout
    await AsyncStorage.removeItem("@user_data");
  };

  const fetchShifts = async () => {
    if (!userData?.kelompok_peserta) return;
    try {
      const response = await fetch(`${API_URL}/shifts/${userData.kelompok_peserta}`);
      const json = await response.json();
      if (json.success && json.data.length > 0) {
        setShiftsData(json.data);
        setSelectedShift(json.data[0].nama_shift);
      }
    } catch (error) {
      console.log("Error fetch shifts:", error);
    }
  };

  // LOGIKA BARU: Fetch History dengan parameter tanggal
  const fetchHistory = async (start = "", end = "") => {
    if (!userData?.nim) return;
    setIsLoadingHistory(true);
    try {
      let url = `${API_URL}/presensi/riwayat/${userData.nim}`;
      if (start && end) {
        url += `?tgl_mulai=${start}&tgl_akhir=${end}`;
      }

      const response = await fetch(url);
      const json = await response.json();
      if (json.success) {
        setHistoryData(json.data);
      }
    } catch (error) {
      console.log("Error fetch history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const checkLocation = async (targetLat = rssaLat, targetLon = rssaLon, targetRadius = radiusMaksimal) => {
    setIsLocating(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showPopup("Izin Ditolak", "Aplikasi butuh akses lokasi.", "error");
        setIsLocating(false);
        return;
      }

      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      // 🛡️ LAPIS KEAMANAN 1: DETEKSI FAKE GPS
      if (loc.mocked) {
        showPopup("Pelanggaran Keamanan", "Sistem mendeteksi penggunaan Lokasi Palsu (Fake GPS). Anda tidak diizinkan melakukan presensi menggunakan aplikasi pihak ketiga!", "error");
        setIsLocating(false);
        return;
      }

      setLocation(loc);
      const distance = calculateDistance(loc.coords.latitude, loc.coords.longitude, targetLat, targetLon);
      setDistanceToRSSA(distance);
      setIsInRadius(distance <= targetRadius);
    } catch (error) {
      showPopup("Error GPS", "Gagal mendapatkan lokasi. Pastikan GPS menyala.", "error");
    } finally {
      setIsLocating(false);
    }
  };

  const handlePresensiValidation = async (type: string) => {
    if (!isInRadius) {
      showPopup("Di Luar Area", `Anda berjarak ${distanceToRSSA}m. Maksimal radius adalah ${radiusMaksimal}m.`, "error");
      return;
    }

    if (!selectedShift || shiftsData.length === 0) {
      showPopup("Peringatan", "Jadwal shift belum dimuat dari server.", "error");
      return;
    }

    const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, "0")}-${String(currentTime.getDate()).padStart(2, "0")}`;
    const todayRecord = historyData.find((item) => item.tanggal === todayStr);

    // LOGIKA BARU: Cari catatan absen yang masih 'gantung' (belum pulang)
    // Bisa jadi dari shift hari ini, atau shift semalam (kemarin)
    const pendingRecord = historyData.find((item) => item.jam_datang && !item.jam_pulang);

    if (type === "DATANG") {
      if (todayRecord && todayRecord.jam_datang) {
        showPopup("Peringatan", "Anda sudah melakukan absen DATANG hari ini!", "error");
        return;
      }
    } else if (type === "PULANG") {
      // Gunakan pendingRecord sebagai acuan, bukan todayRecord
      if (!pendingRecord) {
        showPopup("Peringatan", "Tidak ada riwayat absen DATANG yang masih berjalan. Tidak bisa absen PULANG!", "error");
        return;
      }
      if (pendingRecord.shift !== selectedShift) {
        showPopup("Shift Tidak Sesuai", `Terakhir kali Anda masuk di Shift ${pendingRecord.shift}. Silakan ganti pilihan shift ke ${pendingRecord.shift} untuk absen pulang!`, "error");
        return;
      }
    }

    const shiftData = shiftsData.find((s) => s.nama_shift === selectedShift);
    if (!shiftData) return;

    const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
    let calculatedStatus = "";

    if (type === "DATANG") {
      // Ambil data menit mulai dan menit selesai
      const inStartMins = timeToMinutes(shiftData.jam_datang_mulai);
      const inEndMins = timeToMinutes(shiftData.jam_datang_selesai);

      // LOGIKA BARU: Mencegah Absen Terlalu Cepat (Sebelum Waktunya)
      if (currentMins < inStartMins) {
        showPopup(
          "Belum Waktunya Masuk",
          `Jadwal absen DATANG untuk ${shiftData.nama_shift} baru dibuka pukul ${shiftData.jam_datang_mulai.substring(0, 5)}.\n\nSekarang masih pukul ${currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}, silakan tunggu beberapa saat lagi.`,
          "error",
        );
        return; // Hentikan proses, jangan buka kamera
      }

      // Logika lama: Peringatan jika Terlambat
      if (currentMins > inEndMins) {
        const lateMins = currentMins - inEndMins;
        setConfirmDialog({
          visible: true,
          title: "Peringatan Terlambat",
          message: `Anda terlambat ${lateMins} menit dari jadwal batas datang (${shiftData.jam_datang_selesai.substring(0, 5)}).\n\nTetap lanjutkan absensi?`,
          presensiType: type,
          presensiStatus: `Terlambat ${lateMins} Menit`,
        });
        return;
      } else {
        calculatedStatus = "Tepat Waktu";
      }
    } else if (type === "PULANG") {
      const outStartMins = timeToMinutes(shiftData.jam_pulang_mulai);
      let isEarly = false;
      let earlyMins = 0;

      if (shiftData.is_cross_day) {
        if (currentTime.getHours() >= 20) {
          earlyMins = 24 * 60 - currentMins + outStartMins;
          isEarly = true;
        } else if (currentMins < outStartMins) {
          earlyMins = outStartMins - currentMins;
          isEarly = true;
        }
      } else {
        if (currentMins < outStartMins) {
          isEarly = true;
          earlyMins = outStartMins - currentMins;
        }
      }

      if (isEarly) {
        setConfirmDialog({
          visible: true,
          title: "Peringatan Pulang Awal",
          message: `Anda mencoba pulang lebih awal ${earlyMins} menit dari jam seharusnya (${shiftData.jam_pulang_mulai.substring(0, 5)}).\n\nTetap lanjutkan absensi?`,
          presensiType: type,
          presensiStatus: `Pulang Awal (-${earlyMins} Menit)`,
        });
        return;
      } else {
        calculatedStatus = "Selesai";
      }
    }

    openCamera(type, calculatedStatus);
  };

  const openCamera = async (type: string, status: string) => {
    if (!permission?.granted) {
      const { status: camStatus } = await requestPermission();
      if (camStatus !== "granted") {
        showPopup("Akses Kamera", "Aplikasi butuh akses kamera.", "error");
        return;
      }
    }
    setPresensiType(type);
    setPresensiStatus(status);
    setIsCameraOpen(true);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.2, base64: true });
        setIsCameraOpen(false);
        showPopup("Memproses...", "Mengunggah foto dan menyimpan data...", "success");

        const formData = new FormData();

        formData.append("nim", String(userData?.nim || ""));
        formData.append("type", String(presensiType || ""));
        formData.append("shift", String(selectedShift || ""));
        formData.append("status", String(presensiStatus || ""));

        if (photo.base64) {
          formData.append("foto_base64", photo.base64);
        }

        const response = await fetch(`${API_URL}/presensi`, {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
            "X-API-KEY": API_KEY, // 🛡️ LAPIS KEAMANAN 2: SANDI RAHASIA API
          },
        });

        const textResponse = await response.text();
        let json;
        try {
          json = JSON.parse(textResponse);
        } catch (e) {
          console.log("SERVER CRASH / BUKAN JSON:", textResponse);
          showPopup("Server Error", "Server menolak data. Cek Log Server.", "error");
          return;
        }

        if (json.success) {
          showPopup("Berhasil!", json.message, "success");
          fetchHistory(isFilterActive ? startDate : "", isFilterActive ? endDate : ""); // Segarkan data sesuai filter yang aktif
        } else {
          showPopup("Gagal", json.message, "error");
        }
      } catch (error: any) {
        console.log("DETAIL ERROR UPLOAD:", error.message || error);
        showPopup("Gagal", "Koneksi server bermasalah atau jaringan lambat.", "error");
      }
    }
  };

  const handleSubmitIjin = async () => {
    if (!ijinDate || !ijinReason || !ijinFile) {
      showPopup("Perhatian", "Tanggal, Alasan, dan Berkas Wajib diisi!", "error");
      return;
    }
    try {
      showPopup("Memproses...", "Mengirim data ijin...", "success");
      const response = await fetch(`${API_URL}/ijin`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ nim: userData.nim, tanggal: ijinDate, tipe: ijinType, alasan: ijinReason, file: ijinFile }),
      });
      const json = await response.json();
      if (json.success) {
        showPopup("Berhasil", json.message, "success");
        setIjinDate("");
        setIjinReason("");
        setIjinFile("");
      } else {
        showPopup("Gagal", "Gagal mengirim pengajuan.", "error");
      }
    } catch (error) {
      showPopup("Error", "Gagal terhubung ke server.", "error");
    }
  };

  const showPopup = (title: string, message: string, type: "success" | "error") => {
    setPopupMessage({ visible: true, title, message, type });
  };

  const getFilterButtonText = () => {
    if (!isFilterActive || !startDate || !endDate) return "Menampilkan: HARI INI";
    return `${startDate} s/d ${endDate}`;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    let daysArray = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      daysArray.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push(i);
    }
    return daysArray;
  };

  const handleDaySelect = (day: number) => {
    if (!day) return;
    const year = calendarMonth.getFullYear();
    const month = String(calendarMonth.getMonth() + 1).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    const selectedDateStr = `${year}-${month}-${dayStr}`;

    if (activeDatePicker === "start") setStartDate(selectedDateStr);
    if (activeDatePicker === "end") setEndDate(selectedDateStr);
    if (activeDatePicker === "ijin") setIjinDate(selectedDateStr);

    setIsCalendarModalOpen(false);
    setActiveDatePicker(null);
  };

  const renderHistory = () => {
    // Karena filtering dilakukan di server, kita proses rekap langsung dari historyData
    const totalHadir = historyData.filter((item) => item.jam_datang).length;
    const totalTerlambat = historyData.filter((item) => item.status_datang?.includes("Terlambat")).length;

    const renderItem = ({ item }: { item: any }) => {
      const todayStr = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, "0")}-${String(currentTime.getDate()).padStart(2, "0")}`;
      const isLupaPulang = !item.jam_pulang && item.tanggal !== todayStr;

      return (
        <View style={[styles.historyCard, isLupaPulang && { borderColor: "#fca5a5", borderWidth: 1 }]}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyDate}>{item.tanggal}</Text>
            <View style={styles.badgeShift}>
              <Text style={styles.badgeShiftText}>Shift {item.shift}</Text>
            </View>
          </View>
          <View style={styles.historyBody}>
            <View style={styles.historyItem}>
              <Ionicons name="log-in" size={24} color="#0d9488" />
              <View>
                <Text style={styles.historyLabel}>DATANG</Text>
                <Text style={styles.historyTime}>{item.jam_datang || "--:--"}</Text>
                <Text style={[styles.historyStatus, item.status_datang?.includes("Terlambat") ? { color: "#ea580c" } : {}]}>{item.status_datang || "-"}</Text>
              </View>
            </View>
            <View style={styles.historyItem}>
              <Ionicons name="log-out" size={24} color={isLupaPulang ? "#ef4444" : "#ea580c"} />
              <View>
                <Text style={[styles.historyLabel, isLupaPulang && { color: "#ef4444" }]}>PULANG</Text>
                <Text style={[styles.historyTime, isLupaPulang && { color: "#ef4444" }]}>{item.jam_pulang ? item.jam_pulang : isLupaPulang ? "Lupa Absen" : "--:--"}</Text>
                <Text style={[styles.historyStatus, item.status_pulang?.includes("Awal") ? { color: "#ea580c" } : { color: "#059669" }]}>{item.status_pulang || "-"}</Text>
              </View>
            </View>
          </View>
        </View>
      );
    };

    return (
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Text style={styles.pageTitle}>Riwayat Kehadiran</Text>
          <TouchableOpacity onPress={() => fetchHistory(isFilterActive ? startDate : "", isFilterActive ? endDate : "")} style={{ padding: 8, backgroundColor: "#ccfbf1", borderRadius: 8 }}>
            <Ionicons name="refresh" size={20} color="#0d9488" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.filterBtn} onPress={() => setIsFilterModalOpen(true)}>
          <Ionicons name="filter" size={20} color="#0d9488" />
          <Text style={styles.filterBtnText}>{getFilterButtonText()}</Text>
          <Ionicons name="chevron-down" size={20} color="#9ca3af" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        {!isLoadingHistory && historyData.length > 0 && (
          <View style={styles.summaryContainer}>
            <View style={[styles.summaryBox, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
              <Text style={styles.summaryLabel}>Total Hadir</Text>
              <Text style={[styles.summaryValue, { color: "#059669" }]}>
                {totalHadir} <Text style={{ fontSize: 12 }}>Hari</Text>
              </Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}>
              <Text style={styles.summaryLabel}>Terlambat</Text>
              <Text style={[styles.summaryValue, { color: "#d97706" }]}>
                {totalTerlambat} <Text style={{ fontSize: 12 }}>Kali</Text>
              </Text>
            </View>
          </View>
        )}

        {isLoadingHistory ? (
          <ActivityIndicator size="large" color="#0d9488" style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={historyData}
            keyExtractor={(item, index) => index.toString()}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80 }}
            ListEmptyComponent={() => (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{isFilterActive ? "Belum ada riwayat pada rentang waktu ini." : "Anda belum melakukan absen hari ini."}</Text>
              </View>
            )}
          />
        )}
      </View>
    );
  };

  const renderPermission = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.pageTitle}>Pengajuan Ijin</Text>
      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>Tipe Ijin</Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity style={[styles.radioBtn, ijinType === "Sakit" && styles.radioBtnActive]} onPress={() => setIjinType("Sakit")}>
            <Text style={[styles.radioText, ijinType === "Sakit" && styles.radioTextActive]}>Sakit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.radioBtn, ijinType === "Keluarga" && styles.radioBtnActive]} onPress={() => setIjinType("Keluarga")}>
            <Text style={[styles.radioText, ijinType === "Keluarga" && styles.radioTextActive]}>Keluarga</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.radioBtn, ijinType === "Lainnya" && styles.radioBtnActive]} onPress={() => setIjinType("Lainnya")}>
            <Text style={[styles.radioText, ijinType === "Lainnya" && styles.radioTextActive]}>Lainnya</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>Tanggal Ijin</Text>
        <TouchableOpacity
          style={styles.datePickerBtn}
          onPress={() => {
            setActiveDatePicker("ijin");
            setIsCalendarModalOpen(true);
          }}
        >
          <Text style={ijinDate ? styles.datePickerBtnText : styles.datePickerPlaceholder}>{ijinDate ? ijinDate : "Ketuk untuk pilih kalender..."}</Text>
          <Ionicons name="calendar" size={20} color="#0d9488" />
        </TouchableOpacity>

        <Text style={styles.inputLabel}>Alasan</Text>
        <TextInput style={[styles.inputField, { height: 80, textAlignVertical: "top" }]} placeholder="Alasan detail..." multiline value={ijinReason} onChangeText={setIjinReason} />

        <Text style={styles.inputLabel}>Bukti / Berkas (Wajib)</Text>
        <TouchableOpacity
          style={{
            backgroundColor: ijinFile ? "#ccfbf1" : "#f9fafb",
            borderWidth: 1,
            borderColor: ijinFile ? "#0d9488" : "#e5e7eb",
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
          onPress={() => setIjinFile("surat_keterangan_123.pdf")}
        >
          <Ionicons name="document-attach" size={20} color={ijinFile ? "#0d9488" : "#9ca3af"} />
          <Text style={{ color: ijinFile ? "#0d9488" : "#9ca3af", fontWeight: "bold" }}>{ijinFile ? ijinFile : "Tap untuk Pilih PDF/JPG..."}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitIjin}>
          <Text style={styles.submitBtnText}>Kirim Pengajuan</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.pageTitle}>Profil</Text>
      <View style={styles.profileCard}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={40} color="#ccfbf1" />
        </View>
        <Text style={styles.profileName}>
          {userData?.nama_lengkap} {userData?.gelar ? `, ${userData.gelar}` : ""}
        </Text>
        <Text style={styles.profileNim}>NIM: {userData?.nim}</Text>
        <View style={styles.infoRow}>
          <Ionicons name="school-outline" size={20} color="#6b7280" />
          <Text style={styles.infoText}>{userData?.institusi}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="medical-outline" size={20} color="#6b7280" />
          <Text style={styles.infoText}>{userData?.program_studi}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutButtonText}>Keluar</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderHome = () => {
    if (isCameraOpen) {
      return (
        <View style={styles.cameraContainer}>
          {/* PERBAIKAN 2: CameraView tidak boleh punya anak (children) di dalamnya */}
          <CameraView style={styles.camera} facing={facing} ref={cameraRef} />

          {/* Overlay dikeluarkan dan dipaksa mengambang di atas kamera (Absolute Position) */}
          <View style={styles.cameraOverlayAbsolute}>
            <View style={styles.cameraHeader}>
              <Text style={styles.cameraTitle}>Presensi {presensiType}</Text>
              <Text style={styles.cameraSubtitle}>Pastikan wajah terlihat jelas</Text>
            </View>
            <View style={styles.cameraActions}>
              <TouchableOpacity style={styles.cameraBtnClose} onPress={() => setIsCameraOpen(false)}>
                <Ionicons name="close" size={30} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraBtnCapture} onPress={takePicture}>
                <View style={styles.cameraBtnCaptureInner} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraBtnFlip} onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}>
                <Ionicons name="camera-reverse" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.locationCard, isInRadius ? styles.locationSuccess : styles.locationWarning]}>
          <View style={styles.locationHeader}>
            <Ionicons name={isInRadius ? "checkmark-circle" : "warning"} size={24} color={isInRadius ? "#059669" : "#d97706"} />
            <Text style={[styles.locationTitle, { color: isInRadius ? "#059669" : "#d97706" }]}>{isLocating ? "Mencari Lokasi..." : isInRadius ? "Di Dalam Area RS" : "Di Luar Area RS"}</Text>
          </View>
          <Text style={styles.locationDesc}>{distanceToRSSA !== null ? `Jarak Anda: ${distanceToRSSA}m dari pusat RS. (Maks: ${radiusMaksimal}m)` : "Belum mendapatkan akses GPS."}</Text>
          <TouchableOpacity style={styles.refreshLocBtn} onPress={() => checkLocation()} disabled={isLocating}>
            <Text style={styles.refreshLocText}>{isLocating ? "Memproses..." : "Perbarui Lokasi"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.timeText}>{currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Text>
          <Text style={styles.dateText}>{currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionButton, styles.btnDatang]} onPress={() => handlePresensiValidation("DATANG")}>
            <Ionicons name="location" size={28} color="#fff" />
            <Text style={styles.actionButtonText}>DATANG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.btnPulang]} onPress={() => handlePresensiValidation("PULANG")}>
            <Ionicons name="exit" size={28} color="#fff" />
            <Text style={styles.actionButtonText}>PULANG</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="briefcase-outline" size={16} /> Jadwal Shift Hari Ini
          </Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setIsShiftDropdownOpen(true)}>
            <Text style={styles.dropdownBtnText}>{selectedShift ? selectedShift : "Pilih Shift..."}</Text>
            <Ionicons name="chevron-down" size={20} color="#6b7280" />
          </TouchableOpacity>
          {shiftsData
            .filter((s) => s.nama_shift === selectedShift)
            .map((shift, idx) => (
              <View key={idx} style={styles.shiftDetails}>
                <View style={styles.shiftBadge}>
                  <Ionicons name="log-in-outline" size={14} color="#0d9488" />
                  <Text style={styles.shiftTime}>
                    Datang: {shift.jam_datang_mulai.substring(0, 5)} - {shift.jam_datang_selesai.substring(0, 5)}
                  </Text>
                </View>
                <View style={styles.shiftBadge}>
                  <Ionicons name="log-out-outline" size={14} color="#ea580c" />
                  <Text style={styles.shiftTime}>
                    Pulang: {shift.jam_pulang_mulai.substring(0, 5)} - {shift.jam_pulang_selesai.substring(0, 5)}
                  </Text>
                </View>
              </View>
            ))}
        </View>
      </ScrollView>
    );
  };

  const renderPopup = () => (
    <Modal visible={popupMessage.visible} transparent animationType="fade">
      <View style={styles.popupOverlay}>
        <View style={styles.popupCard}>
          <Ionicons name={popupMessage.type === "success" ? "checkmark-circle" : "close-circle"} size={60} color={popupMessage.type === "success" ? "#0d9488" : "#ef4444"} />
          <Text style={styles.popupTitle}>{popupMessage.title}</Text>
          <Text style={styles.popupText}>{popupMessage.message}</Text>
          <TouchableOpacity style={[styles.popupBtn, { backgroundColor: popupMessage.type === "success" ? "#0d9488" : "#ef4444" }]} onPress={() => setPopupMessage({ ...popupMessage, visible: false })}>
            <Text style={styles.popupBtnText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderConfirmDialog = () => (
    <Modal visible={confirmDialog.visible} transparent animationType="fade">
      <View style={styles.popupOverlay}>
        <View style={styles.popupCard}>
          <Ionicons name="alarm" size={60} color="#ea580c" />
          <Text style={styles.popupTitle}>{confirmDialog.title}</Text>
          <Text style={styles.popupText}>{confirmDialog.message}</Text>
          <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
            <TouchableOpacity style={[styles.popupBtn, { flex: 1, backgroundColor: "#9ca3af" }]} onPress={() => setConfirmDialog({ ...confirmDialog, visible: false })}>
              <Text style={styles.popupBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.popupBtn, { flex: 1, backgroundColor: "#ea580c" }]}
              onPress={() => {
                setConfirmDialog({ ...confirmDialog, visible: false });
                openCamera(confirmDialog.presensiType, confirmDialog.presensiStatus);
              }}
            >
              <Text style={styles.popupBtnText}>Lanjutkan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // LAYAR SPLASH: Ditampilkan sepersekian detik saat mengecek brankas memori
  if (isCheckingLogin) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: "#0f766e" }]}>
        <Image source={require("../../assets/logo-rssa.png")} style={{ width: 120, height: 120, resizeMode: "contain", marginBottom: 24 }} />
        <ActivityIndicator size="large" color="#ccfbf1" />
        <Text style={{ color: "#ccfbf1", marginTop: 16, fontWeight: "bold", fontSize: 16 }}>Menyiapkan Ruang Kerja...</Text>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <View style={styles.loginCard}>
          <View style={styles.logoContainer}>
            <Image source={require("../../assets/logo-rssa.png")} style={{ width: 80, height: 80, resizeMode: "contain" }} />
          </View>

          <Text style={styles.title}>DIKLIT RSSA</Text>
          <Text style={styles.subtitle}>Portal Presensi Peserta Didik</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Masukkan NIM..." placeholderTextColor="#9ca3af" value={nim} onChangeText={setNim} keyboardType="numeric" />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Masukkan Password..." placeholderTextColor="#9ca3af" value={password} onChangeText={setPassword} secureTextEntry />
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Masuk Ke Sistem</Text>}
          </TouchableOpacity>
        </View>

        {renderPopup()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerShape1} />
        <View style={styles.headerShape2} />

        <View style={styles.headerTopRow}>
          <View style={styles.logoWrapper}>
            <Image source={require("../../assets/logo-rssa.png")} style={styles.headerLogoImage} />
          </View>
          <Text style={styles.headerLogoText}>DIKLIT RSSA</Text>
        </View>

        <Text style={styles.welcomeText}>Selamat Bertugas,</Text>
        <Text style={styles.userName} numberOfLines={1}>
          {userData?.nama_lengkap}
        </Text>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{userData?.status}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{userData?.kelompok_peserta}</Text>
          </View>
        </View>
      </View>

      <View style={styles.mainArea}>
        {activeTab === "home" && renderHome()}
        {activeTab === "history" && renderHistory()}
        {activeTab === "permission" && renderPermission()}
        {activeTab === "profile" && renderProfile()}
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("home")}>
          <Ionicons name={activeTab === "home" ? "home" : "home-outline"} size={24} color={activeTab === "home" ? "#0d9488" : "#9ca3af"} />
          <Text style={[styles.navText, activeTab === "home" && styles.navTextActive]}>Beranda</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("history")}>
          <Ionicons name={activeTab === "history" ? "time" : "time-outline"} size={24} color={activeTab === "history" ? "#0d9488" : "#9ca3af"} />
          <Text style={[styles.navText, activeTab === "history" && styles.navTextActive]}>Riwayat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("permission")}>
          <Ionicons name={activeTab === "permission" ? "document-text" : "document-text-outline"} size={24} color={activeTab === "permission" ? "#0d9488" : "#9ca3af"} />
          <Text style={[styles.navText, activeTab === "permission" && styles.navTextActive]}>Ijin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("profile")}>
          <Ionicons name={activeTab === "profile" ? "person" : "person-outline"} size={24} color={activeTab === "profile" ? "#0d9488" : "#9ca3af"} />
          <Text style={[styles.navText, activeTab === "profile" && styles.navTextActive]}>Profil</Text>
        </TouchableOpacity>
      </View>

      {renderPopup()}
      {renderConfirmDialog()}

      <Modal visible={isShiftDropdownOpen} transparent animationType="slide">
        <View style={styles.dropdownOverlay}>
          <View style={styles.dropdownContainer}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Pilih Jadwal Shift</Text>
              <TouchableOpacity onPress={() => setIsShiftDropdownOpen(false)}>
                <Ionicons name="close-circle" size={28} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
              {shiftsData.map((shift, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.dropdownItem, selectedShift === shift.nama_shift && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedShift(shift.nama_shift);
                    setIsShiftDropdownOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownItemText, selectedShift === shift.nama_shift && styles.dropdownItemTextActive]}>{shift.nama_shift}</Text>
                    <Text style={styles.dropdownItemTime}>
                      <Ionicons name="time-outline" /> {shift.jam_datang_mulai.substring(0, 5)} s/d {shift.jam_pulang_selesai.substring(0, 5)}
                    </Text>
                  </View>
                  {selectedShift === shift.nama_shift && <Ionicons name="checkmark-circle" size={24} color="#0d9488" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isFilterModalOpen} transparent animationType="fade">
        <View style={styles.dropdownOverlay}>
          <View style={styles.dropdownContainer}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Filter Rentang Waktu</Text>
              <TouchableOpacity onPress={() => setIsFilterModalOpen(false)}>
                <Ionicons name="close-circle" size={28} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View>
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.inputLabel}>Dari Tanggal</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => {
                    setActiveDatePicker("start");
                    setIsCalendarModalOpen(true);
                  }}
                >
                  <Text style={startDate ? styles.datePickerBtnText : styles.datePickerPlaceholder}>{startDate ? startDate : "Ketuk untuk pilih kalender..."}</Text>
                  <Ionicons name="calendar" size={20} color="#0d9488" />
                </TouchableOpacity>

                <Text style={styles.inputLabel}>Sampai Tanggal</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => {
                    setActiveDatePicker("end");
                    setIsCalendarModalOpen(true);
                  }}
                >
                  <Text style={endDate ? styles.datePickerBtnText : styles.datePickerPlaceholder}>{endDate ? endDate : "Ketuk untuk pilih kalender..."}</Text>
                  <Ionicons name="calendar" size={20} color="#0d9488" />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  style={[styles.popupBtn, { flex: 1, backgroundColor: "#f3f4f6" }]}
                  onPress={() => {
                    setIsFilterActive(false);
                    setStartDate("");
                    setEndDate("");
                    setIsFilterModalOpen(false);
                    fetchHistory(); // Meminta data Hari Ini ke server
                  }}
                >
                  <Text style={[styles.popupBtnText, { color: "#4b5563" }]}>Reset (Hari Ini)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.popupBtn, { flex: 1, backgroundColor: "#0d9488" }]}
                  onPress={() => {
                    if (!startDate || !endDate) {
                      showPopup("Perhatian", "Harap isi kedua tanggal menggunakan kalender!", "error");
                      return;
                    }
                    setIsFilterActive(true);
                    setIsFilterModalOpen(false);
                    fetchHistory(startDate, endDate); // Minta rentang waktu ke server
                  }}
                >
                  <Text style={styles.popupBtnText}>Terapkan Filter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isCalendarModalOpen} transparent animationType="fade">
        <View style={styles.dropdownOverlay}>
          <View style={styles.dropdownContainer}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Pilih Tanggal</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsCalendarModalOpen(false);
                  setActiveDatePicker(null);
                }}
              >
                <Ionicons name="close-circle" size={28} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarContainer}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                  <Ionicons name="chevron-back" size={24} color="#0d9488" />
                </TouchableOpacity>
                <Text style={styles.calendarMonthText}>{calendarMonth.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</Text>
                <TouchableOpacity onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                  <Ionicons name="chevron-forward" size={24} color="#0d9488" />
                </TouchableOpacity>
              </View>

              <View style={styles.calendarDaysHeader}>
                {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day, idx) => (
                  <Text key={idx} style={styles.calendarDayName}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {getDaysInMonth(calendarMonth).map((day, idx) => {
                  let isSelected = false;
                  const currentDateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

                  if (day) {
                    if (activeDatePicker === "start") isSelected = startDate === currentDateStr;
                    else if (activeDatePicker === "end") isSelected = endDate === currentDateStr;
                    else if (activeDatePicker === "ijin") isSelected = ijinDate === currentDateStr;
                  }

                  return (
                    <TouchableOpacity key={idx} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected]} onPress={() => handleDaySelect(day as number)} disabled={!day}>
                      <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{day || ""}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.popupBtn, { backgroundColor: "#f3f4f6", marginTop: 16 }]}
                onPress={() => {
                  setIsCalendarModalOpen(false);
                  setActiveDatePicker(null);
                }}
              >
                <Text style={[styles.popupBtnText, { color: "#4b5563" }]}>Batal Pilih</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
  mainArea: { flex: 1 },

  header: {
    backgroundColor: "#0f766e",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    overflow: "hidden",
  },
  headerShape1: { position: "absolute", top: -50, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.08)" },
  headerShape2: { position: "absolute", bottom: -30, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.04)" },

  headerTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  logoWrapper: { backgroundColor: "#fff", padding: 6, borderRadius: 14, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, marginRight: 12 },
  headerLogoImage: { width: 34, height: 34, resizeMode: "contain" },
  headerLogoText: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 1.5, textShadowColor: "rgba(0,0,0,0.1)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  welcomeText: { color: "#ccfbf1", fontSize: 13, marginBottom: 2 },
  userName: { color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  badges: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  content: { padding: 20 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: "#fff", padding: 20, borderRadius: 24, marginBottom: 16, alignItems: "center", elevation: 2 },
  pageTitle: { fontSize: 24, fontWeight: "bold", color: "#1f2937", marginBottom: 16 },

  loginCard: { margin: 20, marginTop: "30%", backgroundColor: "#fff", padding: 24, borderRadius: 24, elevation: 5 },
  logoContainer: { alignSelf: "center", backgroundColor: "#ccfbf1", padding: 16, borderRadius: 20, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "bold", color: "#1f2937", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 32 },
  inputContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 16, marginBottom: 16, paddingHorizontal: 16 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16 },
  loginButton: { backgroundColor: "#0d9488", padding: 16, borderRadius: 16, alignItems: "center", marginTop: 8 },
  loginButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  locationCard: { padding: 16, borderRadius: 20, marginBottom: 16, borderWidth: 1 },
  locationSuccess: { backgroundColor: "#ecfdf5", borderColor: "#34d399" },
  locationWarning: { backgroundColor: "#fffbeb", borderColor: "#fcd34d" },
  locationHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  locationTitle: { fontSize: 16, fontWeight: "bold" },
  locationDesc: { fontSize: 13, color: "#4b5563", marginBottom: 12 },
  refreshLocBtn: { backgroundColor: "rgba(0,0,0,0.05)", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  refreshLocText: { fontSize: 12, fontWeight: "600", color: "#374151" },

  cameraContainer: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },

  cameraOverlayAbsolute: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "space-between", padding: 24, paddingBottom: 40, backgroundColor: "rgba(0,0,0,0.2)" },

  cameraHeader: { marginTop: 40, alignItems: "center" },
  cameraTitle: { color: "#fff", fontSize: 24, fontWeight: "bold", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  cameraSubtitle: { color: "#fff", fontSize: 14, marginTop: 8, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  cameraActions: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginBottom: 20 },
  cameraBtnClose: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  cameraBtnCapture: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.4)", justifyContent: "center", alignItems: "center" },
  cameraBtnCaptureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff" },
  cameraBtnFlip: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.3)", justifyContent: "center", alignItems: "center" },

  timeText: { fontSize: 44, fontWeight: "900", color: "#1f2937", letterSpacing: -1 },
  dateText: { fontSize: 14, color: "#6b7280", marginTop: 4, backgroundColor: "#f3f4f6", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 },

  dropdownBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%",
    marginBottom: 16,
  },
  dropdownBtnText: { fontSize: 15, fontWeight: "bold", color: "#374151", flex: 1 },

  dropdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  dropdownContainer: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" },
  dropdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  dropdownTitle: { fontSize: 18, fontWeight: "bold", color: "#1f2937" },
  dropdownList: { marginBottom: 20 },
  dropdownItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  dropdownItemActive: { backgroundColor: "#f0fdfa", borderRadius: 12, paddingHorizontal: 12, borderBottomWidth: 0, marginBottom: 4 },
  dropdownItemText: { fontSize: 15, fontWeight: "600", color: "#4b5563", marginBottom: 4 },
  dropdownItemTextActive: { color: "#0d9488", fontWeight: "bold" },
  dropdownItemTime: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },

  actionRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  actionButton: { flex: 1, padding: 20, borderRadius: 24, alignItems: "center", elevation: 3, paddingVertical: 24 },
  btnDatang: { backgroundColor: "#0ea5e9" },
  btnPulang: { backgroundColor: "#f43f5e" },
  actionButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16, marginTop: 8 },
  cardTitle: { fontSize: 14, fontWeight: "bold", color: "#4b5563", alignSelf: "flex-start", marginBottom: 12 },
  shiftDetails: { flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%" },
  shiftBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    flexGrow: 1,
  },
  shiftTime: { fontSize: 12, fontWeight: "bold", color: "#4b5563" },

  popupOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  popupCard: { backgroundColor: "#fff", width: "100%", padding: 24, borderRadius: 24, alignItems: "center", elevation: 10 },
  popupTitle: { fontSize: 20, fontWeight: "bold", color: "#1f2937", marginTop: 16, marginBottom: 8 },
  popupText: { fontSize: 14, color: "#4b5563", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  popupBtn: { width: "100%", padding: 16, borderRadius: 16, alignItems: "center" },
  popupBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  profileCard: { backgroundColor: "#fff", padding: 24, borderRadius: 24, alignItems: "center", marginBottom: 16, elevation: 2 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#0d9488", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  profileName: { fontSize: 20, fontWeight: "bold", color: "#1f2937", textAlign: "center" },
  profileNim: { fontSize: 14, color: "#6b7280", marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 12, marginBottom: 12, paddingHorizontal: 10 },
  infoText: { fontSize: 15, color: "#4b5563", fontWeight: "500" },
  logoutButton: { backgroundColor: "#ef4444", flexDirection: "row", justifyContent: "center", alignItems: "center", padding: 16, borderRadius: 16, gap: 8 },
  logoutButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  formCard: { backgroundColor: "#fff", padding: 20, borderRadius: 24, elevation: 2, marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: "bold", color: "#4b5563", marginBottom: 8, marginTop: 12 },
  inputField: { backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, fontSize: 15 },
  radioGroup: { flexDirection: "row", gap: 8 },
  radioBtn: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb" },
  radioBtnActive: { backgroundColor: "#ccfbf1", borderColor: "#0d9488" },
  radioText: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  radioTextActive: { color: "#0f766e" },
  submitBtn: { backgroundColor: "#0d9488", padding: 16, borderRadius: 16, alignItems: "center", marginTop: 24, elevation: 3 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  bottomNav: { flexDirection: "row", backgroundColor: "#fff", paddingVertical: 12, paddingHorizontal: 8, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 15 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
  navTextActive: { color: "#0d9488", fontWeight: "bold" },

  emptyCard: { alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: "#fff", borderRadius: 24, marginTop: 20 },
  emptyText: { color: "#9ca3af", marginTop: 12, fontWeight: "500", textAlign: "center" },
  filterBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#f0fdfa", borderWidth: 1, borderColor: "#ccfbf1", padding: 14, borderRadius: 16, marginBottom: 16, gap: 10 },
  filterBtnText: { fontSize: 14, fontWeight: "bold", color: "#0f766e" },

  summaryContainer: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryBox: { flex: 1, padding: 14, borderRadius: 16, borderWidth: 1 },
  summaryLabel: { fontSize: 12, color: "#4b5563", fontWeight: "bold", marginBottom: 4 },
  summaryValue: { fontSize: 24, fontWeight: "900" },

  historyCard: { backgroundColor: "#fff", borderRadius: 20, padding: 16, marginBottom: 16, elevation: 2 },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingBottom: 12, marginBottom: 12 },
  historyDate: { fontSize: 15, fontWeight: "bold", color: "#1f2937" },
  badgeShift: { backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeShiftText: { fontSize: 11, fontWeight: "bold", color: "#4b5563" },
  historyBody: { flexDirection: "row", justifyContent: "space-around" },
  historyItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  historyLabel: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  historyTime: { fontSize: 16, fontWeight: "bold", color: "#1f2937" },
  historyStatus: { fontSize: 11, color: "#0d9488", fontWeight: "600", marginTop: 2 },

  calendarContainer: { width: "100%", paddingVertical: 10 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  calendarMonthText: { fontSize: 16, fontWeight: "bold", color: "#1f2937" },
  calendarDaysHeader: { flexDirection: "row", justifyContent: "space-around", marginBottom: 8 },
  calendarDayName: { width: "14%", textAlign: "center", fontSize: 12, color: "#6b7280", fontWeight: "bold" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" },
  calendarDayCell: { width: "14.28%", aspectRatio: 1, justifyContent: "center", alignItems: "center", marginVertical: 2 },
  calendarDayCellSelected: { backgroundColor: "#0d9488", borderRadius: 20 },
  calendarDayText: { fontSize: 14, color: "#374151" },
  calendarDayTextSelected: { color: "#fff", fontWeight: "bold" },
  datePickerBtn: { backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  datePickerBtnText: { fontSize: 15, color: "#1f2937", fontWeight: "600" },
  datePickerPlaceholder: { fontSize: 15, color: "#9ca3af" },
});
